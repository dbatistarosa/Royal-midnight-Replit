import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import Stripe from "stripe";
import { eq, desc, and, or, isNull, ne, sql, inArray } from "drizzle-orm";
import { db, bookingsTable, driversTable, settingsTable, usersTable, promoCodesTable, reviewsTable, extraServicesTable, bookingExtrasTable, driverVehiclesTable, managedTravelersTable } from "@workspace/db";
import { requireAuth, requireAdmin, optionalAuth } from "../middleware/auth.js";
import { getRouteEstimate, DEFAULT_DURATION_MINUTES } from "../lib/maps.js";
import { HOURLY_RATES, DEFAULT_RATE_PER_MILE, computeQuote, readQuoteExtensions } from "./quote.js";
import { evaluatePromoCode } from "./promos.js";
import {
  sendBookingConfirmationPassenger,
  sendNewBookingAdmin,
  sendNewBookingAvailableToDrivers,
  sendBookingCancelledAdmin,
  sendBookingCancelledPassenger,
  sendDriverAcceptedAdmin,
  sendDriverAcceptedPassenger,
  sendDriverUnassignedAdmin,
  sendStatusChangedAdmin,
  sendDriverOnWay,
  sendDriverArrived,
  sendAccountInvitation,
  sendTripCompletionEmail,
  sendBookingAssignedDriver,
} from "../lib/mailer.js";
import { sendDriverOnWaySms, sendDriverArrivedSms, sendCancellationSms } from "../lib/sms.js";
import { sendNewRideOfferPush, sendDriverAssignedPush } from "../lib/push.js";
import { maybeRewardReferrerForCompletedRide } from "../lib/referrals.js";
import {
  ListBookingsQueryParams,
  ListBookingsResponse,
  CreateBookingBody,
  GetBookingParams,
  GetBookingResponse,
  UpdateBookingParams,
  UpdateBookingBody,
  UpdateBookingResponse,
  CancelBookingParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ─── Driver availability helpers ─────────────────────────────────────────────

/**
 * The statuses that mean a driver is actively committed to a trip.
 * These are the only statuses that should block availability for new trips.
 */
const ACTIVE_TRIP_STATUSES = ["confirmed", "in_progress", "on_way", "on_location"] as const;

/** 1-hour buffer on each side of an active trip (in milliseconds). */
const BUFFER_MS = 60 * 60 * 1000;

type BusyWindow = { start: Date; end: Date };

/**
 * Returns an array of time windows during which a driver is unavailable.
 * Each window is:
 *   start = pickupAt − 1 hour
 *   end   = pickupAt + estimatedDurationMinutes + 1 hour
 * If estimatedDurationMinutes is missing we fall back to DEFAULT_DURATION_MINUTES
 * so the buffer is always conservative.
 */
async function getDriverBusyWindows(driverId: number): Promise<BusyWindow[]> {
  const activeTrips = await db
    .select({
      pickupAt: bookingsTable.pickupAt,
      estimatedDurationMinutes: bookingsTable.estimatedDurationMinutes,
    })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.driverId, driverId),
        or(...ACTIVE_TRIP_STATUSES.map(s => eq(bookingsTable.status, s))),
      ),
    );

  return activeTrips.map(trip => {
    const duration = trip.estimatedDurationMinutes ?? DEFAULT_DURATION_MINUTES;
    const pickup = trip.pickupAt.getTime();
    return {
      start: new Date(pickup - BUFFER_MS),
      end: new Date(pickup + (duration * 60 * 1000) + BUFFER_MS),
    };
  });
}

/**
 * Returns true if the given pickup time falls inside ANY of the busy windows.
 */
function hasConflict(pickupAt: Date, windows: BusyWindow[]): boolean {
  const t = pickupAt.getTime();
  return windows.some(w => t >= w.start.getTime() && t <= w.end.getTime());
}

/**
 * True when this error is Postgres 42703 (undefined_column).
 *
 * Drizzle wraps driver errors, so the pg error code is not on the object it
 * throws — it sits somewhere down the `cause` chain. Checking only the top
 * level silently misses every one of them.
 */
function isUndefinedColumn(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; cur && depth < 5; depth++) {
    if ((cur as { code?: string }).code === "42703") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

function parseBooking(b: typeof bookingsTable.$inferSelect) {
  return {
    ...b,
    priceQuoted: parseFloat(b.priceQuoted ?? "0"),
    // Commission base: falls back to priceQuoted for legacy rows / booking paths
    // that don't supply it (e.g. admin manual bookings).
    fareSubtotal: b.fareSubtotal != null ? parseFloat(b.fareSubtotal) : parseFloat(b.priceQuoted ?? "0"),
    discountAmount: b.discountAmount != null ? parseFloat(b.discountAmount) : null,
    tipAmount: b.tipAmount != null ? parseFloat(b.tipAmount) : null,
    pickupAt: b.pickupAt.toISOString(),
    authorizedAt: b.authorizedAt != null ? b.authorizedAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

// ─── Cancellation policy ─────────────────────────────────────────────────────

type CancellationTier = "free" | "partial_25" | "full_100" | "non_cancellable";

interface CancelPreview {
  canCancel: boolean;
  tier: CancellationTier;
  feePercent: number;
  feeAmount: number;
  netRefund: number;
  hoursUntilPickup: number;
  message: string;
  priceQuoted: number;
}

function getCancellationPolicy(pickupAt: Date, priceQuoted: number, status: string): CancelPreview {
  const now = new Date();
  const hoursUntilPickup = (pickupAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (["completed", "cancelled", "in_progress"].includes(status)) {
    return {
      canCancel: false, tier: "non_cancellable",
      feePercent: 0, feeAmount: 0, netRefund: 0,
      hoursUntilPickup,
      message: status === "in_progress"
        ? "This ride is currently in progress and cannot be cancelled."
        : "This booking cannot be cancelled.",
      priceQuoted,
    };
  }

  if (status === "awaiting_payment") {
    return {
      canCancel: true, tier: "free",
      feePercent: 0, feeAmount: 0, netRefund: priceQuoted,
      hoursUntilPickup,
      message: "No payment has been processed yet — you may cancel at no charge.",
      priceQuoted,
    };
  }

  // Policy (2026-07-15, set by owner):
  //   • 12h or more before pickup ........ no charge
  //   • 2–12h before pickup .............. 25% fee
  //   • under 2h before pickup / no-show . 100% charge
  if (hoursUntilPickup >= 12) {
    return {
      canCancel: true, tier: "free",
      feePercent: 0, feeAmount: 0, netRefund: priceQuoted,
      hoursUntilPickup,
      message: "Cancellations made 12 hours or more before pickup are fully refunded — no fee applies.",
      priceQuoted,
    };
  }

  if (hoursUntilPickup >= 2) {
    const feeAmount = Math.round(priceQuoted * 0.25 * 100) / 100;
    return {
      canCancel: true, tier: "partial_25",
      feePercent: 25, feeAmount, netRefund: Math.round((priceQuoted - feeAmount) * 100) / 100,
      hoursUntilPickup,
      message: "Cancellations made 2–12 hours before pickup incur a 25% cancellation fee.",
      priceQuoted,
    };
  }

  const feeAmount = Math.round(priceQuoted * 100) / 100;
  return {
    canCancel: true, tier: "full_100",
    feePercent: 100, feeAmount, netRefund: 0,
    hoursUntilPickup,
    message: "Cancellations made less than 2 hours before pickup (including no-shows) are charged in full.",
    priceQuoted,
  };
}

async function getCommissionPct(): Promise<number> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "driver_commission_pct"));
  // Stored as whole percent (e.g. "70" = 70%); divide by 100 to get multiplier
  return row ? parseFloat(row.value) / 100 : 0.70;
}

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2024-06-20" as const });
}

function toDriverView<T extends { priceQuoted: number; fareSubtotal: number }>(
  booking: T,
  commissionPct: number
): Omit<T, "priceQuoted" | "fareSubtotal"> & { driverEarnings: number } {
  const { priceQuoted, fareSubtotal, ...rest } = booking;
  return {
    ...rest,
    // Commission is on the undiscounted, pre-tax/pre-fee subtotal — drivers are
    // unaffected by company promos/coupons and never see priceQuoted/fareSubtotal directly.
    driverEarnings: Math.round(fareSubtotal * commissionPct * 100) / 100,
  };
}

router.get("/bookings", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListBookingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const caller = req.currentUser!;

  const conditions = [];
  // Driver open-pool requests get a widened status filter further down (the
  // pool must also include unassigned corporate "confirmed" bookings), so the
  // plain equality filter is skipped for that specific case.
  const isDriverPoolRequest = caller.role === "driver" &&
    (parsed.data.status === "pending" || parsed.data.status === "authorized") &&
    parsed.data.driverId == null;
  if (parsed.data.status && !isDriverPoolRequest) conditions.push(eq(bookingsTable.status, parsed.data.status));
  if (parsed.data.driverId != null) conditions.push(eq(bookingsTable.driverId, parsed.data.driverId));
  if (parsed.data.userId != null) conditions.push(eq(bookingsTable.userId, parsed.data.userId));
  if (parsed.data.startDate) {
    const d = new Date(parsed.data.startDate);
    if (isNaN(d.getTime())) { res.status(400).json({ error: "Invalid startDate — must be a parseable ISO date string." }); return; }
    conditions.push(sql`${bookingsTable.createdAt} >= ${d}`);
  }
  if (parsed.data.endDate) {
    const d = new Date(parsed.data.endDate);
    if (isNaN(d.getTime())) { res.status(400).json({ error: "Invalid endDate — must be a parseable ISO date string." }); return; }
    conditions.push(sql`${bookingsTable.createdAt} <= ${d}`);
  }

  // Drivers never see unconfirmed/unpaid bookings — only admin and passengers see them.
  // Passengers see their own (scoped below), admin sees all, drivers see none.
  if (caller.role === "driver" && !parsed.data.status) {
    conditions.push(ne(bookingsTable.status, "awaiting_payment"));
  }

  // Non-admin drivers: either see their own assigned bookings, or unassigned open pool
  // driverBusyWindows is populated here and used later to filter the open pool results.
  let driverBusyWindows: BusyWindow[] = [];
  let isDriverOpenPoolQuery = false;

  if (caller.role === "driver") {
    const requestedDriverId = parsed.data.driverId;
    const requestedStatus = parsed.data.status;

    if (requestedDriverId != null) {
      // When the frontend explicitly passes driverId, verify ownership directly from that
      // driver record. This is the most reliable path and avoids userId/email mismatch bugs
      // that occur when a driver has multiple records (onboarding + admin-created).
      const [targetDriver] = await db
        .select({ id: driversTable.id, userId: driversTable.userId, email: driversTable.email })
        .from(driversTable)
        .where(eq(driversTable.id, requestedDriverId));

      if (!targetDriver) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      // Verify caller owns this driver record (by userId or by email match)
      let authorized = targetDriver.userId === caller.userId;
      if (!authorized && targetDriver.email) {
        const [callerUser] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, caller.userId));
        authorized = !!callerUser?.email && callerUser.email.toLowerCase() === targetDriver.email.toLowerCase();
        // Retroactively link so future requests use the fast path
        if (authorized && !targetDriver.userId) {
          db.update(driversTable).set({ userId: caller.userId }).where(eq(driversTable.id, targetDriver.id))
            .catch(err => console.error("[bookings] retroactive driver userId link error:", err));
        }
      }

      if (!authorized) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      // driverId condition already added at line ~209 via parsed.data.driverId
    } else {
      // No explicit driverId — look up the driver by caller identity.
      // Order by total_rides DESC so we always get the most active record when
      // a driver has two entries (admin-created with history + onboarding record).
      const byUserId = await db.select({ id: driversTable.id, totalRides: driversTable.totalRides })
        .from(driversTable)
        .where(eq(driversTable.userId, caller.userId))
        .orderBy(desc(driversTable.totalRides));
      let driverRow: { id: number } | undefined = byUserId[0];

      // Fallback: match by email if userId link was never set
      if (!driverRow) {
        const [callerUser] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, caller.userId));
        if (callerUser?.email) {
          const found = await db.select({ id: driversTable.id, totalRides: driversTable.totalRides })
            .from(driversTable)
            .where(eq(driversTable.email, callerUser.email))
            .orderBy(desc(driversTable.totalRides));
          driverRow = found[0];
          if (driverRow) {
            db.update(driversTable).set({ userId: caller.userId }).where(eq(driversTable.id, driverRow.id))
              .catch(err => console.error("[bookings] retroactive driver userId link error:", err));
          }
        }
      }

      if (!driverRow) {
        res.json([]);
        return;
      }

      if (requestedStatus === "pending" || requestedStatus === "authorized") {
        // Requesting the open/unassigned pool — includes pending and authorized
        // bookings, plus corporate bookings (those are created directly as
        // "confirmed" with no payment step and still need a driver to accept).
        // Pre-fetch this driver's busy windows so conflicting trips can be hidden below.
        conditions.push(isNull(bookingsTable.driverId));
        conditions.push(inArray(bookingsTable.status, ["pending", "authorized", "confirmed"]));
        isDriverOpenPoolQuery = true;
        driverBusyWindows = await getDriverBusyWindows(driverRow.id);
      } else {
        // Default: own assigned bookings only
        conditions.push(eq(bookingsTable.driverId, driverRow.id));
      }
    }
  }

  // Passengers and corporate accounts can only see their own bookings
  // Include both userId-linked AND email-matched (admin-created) bookings
  if (caller.role === "passenger" || caller.role === "corporate") {
    const requestedUserId = parsed.data.userId;
    if (requestedUserId != null && requestedUserId !== caller.userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const [callerUser] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, caller.userId));
    const userEmail = callerUser?.email ?? "";
    conditions.push(
      or(
        eq(bookingsTable.userId, caller.userId),
        and(eq(bookingsTable.passengerEmail, userEmail), isNull(bookingsTable.userId))
      )!
    );
  }

  if (caller.role === "admin") {
    // Admin gets a joined result with the user's role so the UI can distinguish corporate vs standard bookings
    const rows = await db
      .select({ booking: bookingsTable, userRole: usersTable.role })
      .from(bookingsTable)
      .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(bookingsTable.createdAt));

    res.json(rows.map(({ booking, userRole }) => ({ ...parseBooking(booking), userRole: userRole ?? null })));
    return;
  }

  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(bookingsTable.createdAt));

  const parsed2 = bookings.map(parseBooking);

  if (caller.role === "driver") {
    const commissionPct = await getCommissionPct();
    let driverBookings = parsed2;

    // For the open pool, hide trips that conflict with the driver's existing schedule.
    if (isDriverOpenPoolQuery && driverBusyWindows.length > 0) {
      driverBookings = parsed2.filter(b => !hasConflict(new Date(b.pickupAt), driverBusyWindows));
    }

    // Attach passenger preferences so the driver can stage the vehicle correctly.
    // Batch-fetch preferences for all unique userIds in this response.
    const userIds = [...new Set(driverBookings.map(b => (b as any).userId).filter(Boolean) as number[])];
    const prefsByUserId = new Map<number, Record<string, unknown>>();
    if (userIds.length > 0) {
      const prefRows = await db
        .select({
          id: usersTable.id,
          cabinTempF: usersTable.cabinTempF,
          musicPreference: usersTable.musicPreference,
          quietRide: usersTable.quietRide,
          preferredBeverage: usersTable.preferredBeverage,
          opensOwnDoor: usersTable.opensOwnDoor,
          addressTitle: usersTable.addressTitle,
          vipNotes: usersTable.vipNotes,
        })
        .from(usersTable)
        .where(
          userIds.length === 1
            ? eq(usersTable.id, userIds[0]!)
            : inArray(usersTable.id, userIds)
        );
      for (const p of prefRows) {
        const { id, ...prefs } = p;
        // Only include if at least one preference is set
        if (Object.values(prefs).some(v => v != null && v !== false)) {
          prefsByUserId.set(id, prefs);
        }
      }
    }

    res.json(
      driverBookings.map(b => {
        const view = toDriverView(b, commissionPct);
        const uid = (b as any).userId as number | null;
        const passengerPreferences = uid ? (prefsByUserId.get(uid) ?? null) : null;
        return { ...view, passengerPreferences };
      })
    );
    return;
  }

  // Return data as-is for passenger/corporate — skip Zod re-validation to avoid
  // enum mismatches from legacy seeded rows with old vehicleClass values
  res.json(parsed2);
});

router.post("/bookings", optionalAuth, async (req, res): Promise<void> => {
  // Public endpoint — allows anonymous booking creation from the booking form.
  // Corporate account paymentType is restricted: caller must be authenticated as role=corporate (or admin).
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const caller = req.currentUser;
  const isCorporate = parsed.data.paymentType === "corporate_account";

  if (isCorporate) {
    if (!caller || (caller.role !== "corporate" && caller.role !== "admin")) {
      res.status(403).json({ error: "Corporate account bookings require a corporate or admin account" });
      return;
    }
  }

  // ── Booking owner ───────────────────────────────────────────────────────────
  // userId is never taken from the body on trust: an anonymous caller could
  // otherwise attribute bookings to any account. Admins may book on anyone's
  // behalf, and an executive assistant may book for a traveler they manage;
  // everyone else is pinned to their own id.
  let bookingUserId: number | null = caller?.userId ?? null;
  const requestedUserId = parsed.data.userId ?? null;
  if (requestedUserId != null && requestedUserId !== caller?.userId) {
    if (caller?.role === "admin") {
      bookingUserId = requestedUserId;
    } else if (caller) {
      const [managed] = await db
        .select({ travelerId: managedTravelersTable.travelerId })
        .from(managedTravelersTable)
        .where(and(
          eq(managedTravelersTable.eaUserId, caller.userId),
          eq(managedTravelersTable.travelerId, requestedUserId),
        ));
      if (managed) bookingUserId = requestedUserId;
    }
  }

  // ── Server-side fare derivation (CN-001) ────────────────────────────────────
  // The fare is never taken from the request body. It is recomputed here with
  // the same engine that answers POST /quote, then extras and any promo are
  // applied on top using database values. A client-supplied priceQuoted that
  // disagrees is logged and ignored, so a tampered request cannot produce a
  // free ride and an honest one is never rejected over rounding.
  const ext = readQuoteExtensions(req.body);
  const quoteOutcome = await computeQuote({
    pickupAddress: parsed.data.pickupAddress,
    dropoffAddress: parsed.data.dropoffAddress,
    vehicleClass: parsed.data.vehicleClass as string,
    pickupAt: parsed.data.pickupAt,
    waypoints: ext.waypoints,
    charterMode: ext.charterMode,
    charterHours: ext.charterHours,
    userId: isCorporate && caller?.role === "corporate" ? caller.userId : (bookingUserId ?? undefined),
    // Admins take phone bookings for trips that may be imminent.
    skipLeadTimeCheck: caller?.role === "admin",
  });
  if (!quoteOutcome.ok) {
    res.status(quoteOutcome.status).json(quoteOutcome.body);
    return;
  }
  const quote = quoteOutcome.quote;

  // Extras are priced from extra_services, never from the body.
  const requestedExtras = parsed.data.extras ?? [];
  const pricedExtras: Array<{ id: number; quantity: number; price: number }> = [];
  if (requestedExtras.length) {
    const services = await db
      .select({ id: extraServicesTable.id, price: extraServicesTable.price })
      .from(extraServicesTable)
      .where(and(
        inArray(extraServicesTable.id, requestedExtras.map(e => e.id)),
        eq(extraServicesTable.isActive, true),
      ));
    for (const s of services) {
      pricedExtras.push({
        id: s.id,
        quantity: requestedExtras.find(e => e.id === s.id)?.quantity ?? 1,
        price: parseFloat(String(s.price)) || 0,
      });
    }
  }
  const extrasTotal = pricedExtras.reduce((sum, e) => sum + e.price * e.quantity, 0);

  // Promo discount is re-derived from the promo_codes row. An invalid or
  // exhausted code yields no discount rather than failing the whole booking.
  const grossTotal = Math.round((quote.totalWithTax + extrasTotal) * 100) / 100;
  let discountAmount = 0;
  let appliedPromoCode: string | null = null;
  if (parsed.data.promoCode) {
    const promo = await evaluatePromoCode(parsed.data.promoCode, grossTotal);
    if (promo.valid && promo.discountAmount != null) {
      discountAmount = promo.discountAmount;
      appliedPromoCode = promo.code;
    }
  }

  const priceQuoted = Math.max(0, Math.round((grossTotal - discountAmount) * 100) / 100);
  // Driver commission base: base fare + billable miles (+surge) only. Taxes,
  // the card fee, promo discounts and the airport fee are all company-side —
  // the driver never earns on them. Flat routes pay commission on the flat price.
  const fareSubtotal = quote.fixedRoutePrice
    ?? Math.round((quote.baseFare + quote.distanceCharge + quote.surgeAdjustment) * 100) / 100;

  if (Math.abs(parsed.data.priceQuoted - priceQuoted) > 0.01) {
    console.warn(
      `[bookings] fare mismatch — client sent ${parsed.data.priceQuoted}, server derived ${priceQuoted}; using server value`,
    );
  }

  // A promo can legitimately discount a booking to $0 — there is no card to
  // charge, so skip the awaiting_payment/Stripe step and drop it straight into
  // the same "pending" state a paid booking reaches. This is now driven by the
  // server-derived price, so a client can no longer force it.
  const isFreeBooking = !isCorporate && priceQuoted <= 0;

  const bookingValues = {
      // Explicit field list — never spread the request body, which would let a
      // caller set columns the schema does not intend them to control.
      passengerName: parsed.data.passengerName,
      passengerEmail: parsed.data.passengerEmail,
      passengerPhone: parsed.data.passengerPhone,
      pickupAddress: parsed.data.pickupAddress,
      dropoffAddress: parsed.data.dropoffAddress,
      pickupAt: new Date(parsed.data.pickupAt),
      vehicleClass: parsed.data.vehicleClass,
      passengers: parsed.data.passengers,
      luggageCount: parsed.data.luggageCount,
      flightNumber: parsed.data.flightNumber ?? null,
      specialRequests: parsed.data.specialRequests ?? null,
      userId: bookingUserId,
      promoCode: appliedPromoCode,
      priceQuoted: String(priceQuoted),
      fareSubtotal: String(fareSubtotal),
      discountAmount: discountAmount > 0 ? String(discountAmount) : null,
      paymentType: parsed.data.paymentType ?? "standard",
      // Corporate bookings are confirmed immediately; fully-discounted bookings skip
      // payment and go straight to pending (open driver pool). Everyone else
      // (including admin-manual) awaits payment.
      status: isCorporate ? "confirmed" : isFreeBooking ? "pending" : "awaiting_payment",
    // Public handle for the confirmation and tracking pages (CN-005).
    trackingToken: crypto.randomBytes(16).toString("hex"),
  };

  // The tracking_token column arrives via migration 0004. Deploys and migrations
  // are applied separately here, so tolerate the window where the code is ahead
  // of the schema: a booking that cannot be created is a far worse outcome than
  // one without a token. Postgres 42703 is undefined_column. Once the migration
  // lands this branch simply stops being taken.
  let booking: typeof bookingsTable.$inferSelect;
  try {
    [booking] = await db.insert(bookingsTable).values(bookingValues).returning() as [typeof bookingsTable.$inferSelect];
  } catch (err: unknown) {
    if (!isUndefinedColumn(err)) throw err;
    console.error(
      "[bookings] tracking_token column is missing — run migration 0004_booking_tracking_token.sql. " +
      "Falling back to creating this booking without a tracking token.",
    );
    const { trackingToken: _omitted, ...withoutToken } = bookingValues;
    [booking] = await db.insert(bookingsTable).values(withoutToken).returning() as [typeof bookingsTable.$inferSelect];
  }

  // trackingToken rides alongside the contract response rather than inside it:
  // it is the one field the creator must receive and nobody else ever should,
  // so it stays out of the shared booking shape that other endpoints return.
  res.status(201).json({
    ...GetBookingResponse.parse(parseBooking(booking)),
    trackingToken: booking.trackingToken,
  });

  // ── Route estimate (non-blocking) ────────────────────────────────────────────
  // Fetch driving time and distance from Google Maps so the driver scheduling
  // conflict detector can prevent impossible back-to-back trip assignments.
  (async () => {
    try {
      const estimate = await getRouteEstimate(booking.pickupAddress, booking.dropoffAddress);
      const durationMinutes = estimate?.durationMinutes ?? DEFAULT_DURATION_MINUTES;
      const distanceMiles = estimate?.distanceMiles ?? null;
      await db
        .update(bookingsTable)
        .set({
          estimatedDurationMinutes: durationMinutes,
          estimatedDistanceMiles: distanceMiles != null ? String(distanceMiles) : null,
        })
        .where(eq(bookingsTable.id, booking.id));
    } catch (err) {
      console.error("[bookings] route estimate error:", err);
    }
  })();

  // ── Account linking (non-blocking, admin-created bookings) ───────────────────
  // When an admin creates a booking manually, link it to an existing user account
  // (by email) or send the passenger an invitation to create one.
  if (caller?.role === "admin" && !parsed.data.userId) {
    (async () => {
      try {
        const [existingUser] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.email, booking.passengerEmail));

        if (existingUser) {
          // Attach booking to their existing account
          await db
            .update(bookingsTable)
            .set({ userId: existingUser.id })
            .where(eq(bookingsTable.id, booking.id));
          console.log(`[bookings] Linked booking #${booking.id} to existing user #${existingUser.id} (${booking.passengerEmail})`);
        } else {
          // New passenger — send invitation to create an account
          await sendAccountInvitation({
            passengerName: booking.passengerName,
            passengerEmail: booking.passengerEmail,
            bookingId: booking.id,
          });
          console.log(`[bookings] Sent account invitation to new passenger: ${booking.passengerEmail}`);
        }
      } catch (err) {
        console.error("[bookings] account-linking error:", err);
      }
    })();
  }

  // Persist selected extras (non-blocking). The ids were already validated as
  // existing and active above, and priced from the extra_services table, so the
  // stored priceAtBooking matches what the fare was actually computed from.
  if (pricedExtras.length) {
    (async () => {
      try {
        await db.insert(bookingExtrasTable).values(
          pricedExtras.map(e => ({
            bookingId: booking.id,
            extraServiceId: e.id,
            quantity: e.quantity,
            priceAtBooking: String(e.price),
          }))
        ).onConflictDoNothing();
      } catch (err) { console.error("[bookings] extras insert failed:", err); }
    })();
  }

  // If a promo code was used, increment its usedCount (non-blocking)
  if (booking.promoCode) {
    db.update(promoCodesTable)
      .set({ usedCount: sql`${promoCodesTable.usedCount} + 1` })
      .where(eq(promoCodesTable.code, booking.promoCode))
      .catch(err => console.error("[bookings] promoCode usedCount increment failed:", err));
  }

  // Corporate and fully-discounted bookings: fire emails immediately since there's no payment step
  if (isCorporate || isFreeBooking) {
    (async () => {
      try {
        const parsed2 = parseBooking(booking);
        const commissionPct = await getCommissionPct();
        const driverEarnings = Math.round(parsed2.fareSubtotal * commissionPct * 100) / 100;
        const emailData = {
          ...parsed2,
          vehicleClass: parsed2.vehicleClass ?? "business",
          passengers: parsed2.passengers ?? 1,
          driverEarnings,
        };
        const approvedDrivers = await db
          .select({ email: usersTable.email })
          .from(driversTable)
          .innerJoin(usersTable, eq(driversTable.userId, usersTable.id))
          .where(eq(driversTable.approvalStatus, "approved"));
        const driverEmails = approvedDrivers.map(d => d.email).filter(Boolean) as string[];

        const pushableDrivers = await db
          .select({ pushToken: driversTable.pushToken, pushPlatform: driversTable.pushPlatform })
          .from(driversTable)
          .where(and(eq(driversTable.status, "available"), eq(driversTable.complianceHold, false)));

        // Each notification is independent — one failing (e.g. a bad template field)
        // must never silently prevent the others from firing, especially the driver
        // fan-out, which is how drivers learn a ride is available to claim.
        const results = await Promise.allSettled([
          sendBookingConfirmationPassenger(emailData),
          sendNewBookingAdmin(emailData),
          sendNewBookingAvailableToDrivers(emailData, driverEmails),
          sendNewRideOfferPush(pushableDrivers, { id: booking.id, pickupAddress: booking.pickupAddress, driverEarnings }),
        ]);
        for (const r of results) {
          if (r.status === "rejected") console.error("[bookings] post-create notification failed:", r.reason);
        }
      } catch (err) {
        console.error("[bookings] post-create email error:", err);
      }
    })();
  }
});

// Public receipt/tracking endpoint, addressed by an unguessable token (CN-005).
//
// This replaces GET /bookings/:id/track. Booking ids are sequential, so that
// route let anyone walk id=1..N and harvest every customer's name, home
// address, destination and pickup time — for a chauffeur service that is a
// physical-safety exposure, not just a privacy one.
//
// Holding the token is the authorization: it is only ever returned to whoever
// created the booking, so returning the full receipt to a token holder is the
// same trust model as any "manage my booking" link. The email stays masked
// because the page only needs to show where the receipt went.
router.get("/bookings/track/:token", async (req, res): Promise<void> => {
  const token = String(req.params["token"] ?? "");
  // Reject anything that is not a well-formed token before touching the DB, so
  // this endpoint can never be used as a scan surface.
  if (!/^[0-9a-f]{32,64}$/.test(token)) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  let booking: typeof bookingsTable.$inferSelect | undefined;
  try {
    [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.trackingToken, token));
  } catch (err: unknown) {
    // Same migration window as booking creation — see the insert above.
    if (!isUndefinedColumn(err)) throw err;
    console.error("[bookings] tracking_token column is missing — run migration 0004_booking_tracking_token.sql");
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const maskedEmail = booking.passengerEmail
    ? booking.passengerEmail.replace(/^(.).+(@.+)$/, "$1***$2")
    : null;

  // Never cached by a shared proxy — the URL is a bearer credential.
  res.set("Cache-Control", "no-store");

  res.json({
    id: booking.id,
    status: booking.status,
    passengerName: booking.passengerName,
    passengerEmail: maskedEmail,
    pickupAddress: booking.pickupAddress,
    dropoffAddress: booking.dropoffAddress,
    pickupAt: booking.pickupAt.toISOString(),
    driverId: booking.driverId,
    vehicleClass: booking.vehicleClass,
    passengers: booking.passengers,
    luggageCount: booking.luggageCount,
    flightNumber: booking.flightNumber ?? null,
    specialRequests: booking.specialRequests ?? null,
    priceQuoted: booking.priceQuoted ? parseFloat(booking.priceQuoted) : null,
    discountAmount: booking.discountAmount ? parseFloat(booking.discountAmount) : null,
    promoCode: booking.promoCode ?? null,
    paymentType: booking.paymentType ?? null,
  });
});

// Driver info for passenger — reveals phone, vehicle, and plate only within 48h of pickup.
// This keeps personal contact details private until the trip is close enough to be relevant.
router.get("/bookings/:id/driver-info", requireAuth, async (req, res): Promise<void> => {
  const params = GetBookingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.role !== "driver" &&
      booking.userId !== caller.userId && booking.passengerEmail !== (caller as any).email) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (!booking.driverId) {
    res.json({ available: false, reason: "no_driver" });
    return;
  }

  const ACTIVE_STATUSES = ["on_way", "on_location", "in_progress", "completed", "cancelled"];
  const hoursUntilPickup = (new Date(booking.pickupAt).getTime() - Date.now()) / (1000 * 60 * 60);
  const withinWindow = hoursUntilPickup <= 48 || ACTIVE_STATUSES.includes(booking.status);

  if (!withinWindow) {
    res.json({
      available: false,
      reason: "too_early",
      hoursUntilPickup: Math.round(hoursUntilPickup),
    });
    return;
  }

  const [driver] = await db
    .select({
      name: driversTable.name,
      phone: driversTable.phone,
      vehicleYear: driversTable.vehicleYear,
      vehicleMake: driversTable.vehicleMake,
      vehicleModel: driversTable.vehicleModel,
      vehicleColor: driversTable.vehicleColor,
      regPlate: driversTable.regPlate,
      profilePicture: driversTable.profilePicture,
    })
    .from(driversTable)
    .where(eq(driversTable.id, booking.driverId));

  if (!driver) { res.json({ available: false, reason: "driver_not_found" }); return; }

  // Prefer the vehicle the driver actually chose for THIS trip (multi-vehicle
  // drivers pick one at accept time); fall back to the legacy driver fields.
  let vehicleDescription = "";
  let regPlate: string | null = driver.regPlate ?? null;
  if (booking.selectedVehicleId != null) {
    const [selected] = await db
      .select({ year: driverVehiclesTable.year, make: driverVehiclesTable.make, model: driverVehiclesTable.model, color: driverVehiclesTable.color, regPlate: driverVehiclesTable.regPlate })
      .from(driverVehiclesTable)
      .where(eq(driverVehiclesTable.id, booking.selectedVehicleId));
    if (selected) {
      vehicleDescription = [selected.color, selected.year, selected.make, selected.model].filter(Boolean).join(" ");
      regPlate = selected.regPlate ?? regPlate;
    }
  }
  if (!vehicleDescription) {
    vehicleDescription = [driver.vehicleColor, driver.vehicleYear, driver.vehicleMake, driver.vehicleModel]
      .filter(Boolean).join(" ") || "Luxury Vehicle";
  }

  res.json({
    available: true,
    driverName: driver.name,
    driverPhone: driver.phone,
    vehicleDescription,
    regPlate,
    profilePicture: driver.profilePicture ?? null,
  });
});

// Authenticated single-booking endpoint
router.get("/bookings/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const caller = req.currentUser!;

  // Authenticated driver: can only access their own assigned bookings; receive driver-view (no priceQuoted)
  if (caller.role === "driver") {
    const [driverRow] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, caller.userId));
    if (!driverRow || booking.driverId !== driverRow.id) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const commissionPct = await getCommissionPct();
    res.json(toDriverView(parseBooking(booking), commissionPct));
    return;
  }

  // Passengers and corporate accounts: can only access their own bookings
  // Allow access if booking is linked by userId OR by matching passengerEmail
  if (caller.role === "passenger" || caller.role === "corporate") {
    if (booking.userId !== caller.userId) {
      // Check if email matches (covers admin-created bookings not yet linked by userId)
      const [callerUser] = await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, caller.userId));
      if (!callerUser || booking.passengerEmail !== callerUser.email) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }
  }

  // For passengers/corporate: include existing rating if any
  if (caller.role === "passenger" || caller.role === "corporate" || caller.role === "admin") {
    const [existingReview] = await db
      .select({ rating: reviewsTable.rating, comment: reviewsTable.comment })
      .from(reviewsTable)
      .where(eq(reviewsTable.bookingId, params.data.id));
    const base = parseBooking(booking);
    return res.json({
      ...base,
      hasRating: existingReview != null,
      existingRating: existingReview?.rating ?? null,
      existingComment: existingReview?.comment ?? null,
    });
  }

  res.json(parseBooking(booking));
});

// GET /bookings/:id/flight-status — live flight status for bookings with a flight number.
// Accessible by the passenger (own booking), their assigned driver, and admins.
router.get("/bookings/:id/flight-status", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const caller = req.currentUser!;
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

  // Access control: passenger (own booking), assigned driver, or admin
  if (caller.role === "passenger" || caller.role === "corporate") {
    if (booking.userId !== caller.userId) {
      const [callerUser] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, caller.userId));
      if (!callerUser || booking.passengerEmail !== callerUser.email) {
        res.status(403).json({ error: "Access denied" }); return;
      }
    }
  } else if (caller.role === "driver") {
    const [driverRow] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, caller.userId));
    if (!driverRow || booking.driverId !== driverRow.id) {
      res.status(403).json({ error: "Access denied" }); return;
    }
  } else if (caller.role !== "admin") {
    res.status(403).json({ error: "Access denied" }); return;
  }

  if (!booking.flightNumber) {
    res.json({ available: false, reason: "no_flight_number" });
    return;
  }

  const { getFlightStatus, isFlightStatusConfigured } = await import("../lib/flightStatus.js");

  if (!isFlightStatusConfigured()) {
    res.json({ available: false, reason: "not_configured", flightNumber: booking.flightNumber });
    return;
  }

  const status = await getFlightStatus(booking.flightNumber);
  if (!status) {
    res.json({ available: false, reason: "not_found", flightNumber: booking.flightNumber });
    return;
  }

  res.json({ available: true, ...status });
});

// GET /bookings/:id/driver-location — passenger-accessible live driver position.
// Only returns data when booking status is on_way or on_location and driver has shared coords.
router.get("/bookings/:id/driver-location", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const caller = req.currentUser!;
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

  // Passengers: only their own bookings
  if (caller.role === "passenger" || caller.role === "corporate") {
    if (booking.userId !== caller.userId) {
      const [callerUser] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, caller.userId));
      if (!callerUser || booking.passengerEmail !== callerUser.email) {
        res.status(403).json({ error: "Access denied" }); return;
      }
    }
  } else if (caller.role !== "admin") {
    res.status(403).json({ error: "Access denied" }); return;
  }

  // Only active while driver is on the way or on location
  if (!["on_way", "on_location"].includes(booking.status)) {
    res.json({ available: false, status: booking.status });
    return;
  }

  if (!booking.driverId) { res.json({ available: false, status: booking.status }); return; }

  const [driver] = await db
    .select({
      latitude: driversTable.latitude,
      longitude: driversTable.longitude,
      locationUpdatedAt: driversTable.locationUpdatedAt,
      name: usersTable.name,
    })
    .from(driversTable)
    .innerJoin(usersTable, eq(driversTable.userId, usersTable.id))
    .where(eq(driversTable.id, booking.driverId));

  if (!driver?.latitude || !driver?.longitude) {
    res.json({ available: false, status: booking.status, reason: "no_location" });
    return;
  }

  res.json({
    available: true,
    status: booking.status,
    lat: parseFloat(driver.latitude),
    lng: parseFloat(driver.longitude),
    driverName: driver.name,
    locationUpdatedAt: driver.locationUpdatedAt ? driver.locationUpdatedAt.toISOString() : null,
    pickupAddress: booking.pickupAddress,
    dropoffAddress: booking.dropoffAddress,
    pickupLat: null,
    pickupLng: null,
  });
});

router.patch("/bookings/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [before] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));

  const updateData: Record<string, unknown> = {};
  if (parsed.data.status != null) updateData.status = parsed.data.status;
  if (parsed.data.driverId !== undefined) updateData.driverId = parsed.data.driverId;
  if (parsed.data.vehicleId !== undefined) updateData.vehicleId = parsed.data.vehicleId;
  if (parsed.data.specialRequests !== undefined) updateData.specialRequests = parsed.data.specialRequests;

  const [booking] = await db
    .update(bookingsTable)
    .set(updateData)
    .where(eq(bookingsTable.id, params.data.id))
    .returning();

  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  res.json(UpdateBookingResponse.parse(parseBooking(booking)));

  // Fire-and-forget: notify admin on status change
  if (before && parsed.data.status && before.status !== parsed.data.status) {
    (async () => {
      try {
        await sendStatusChangedAdmin(booking.id, before.status, booking.status, booking.passengerName);
      } catch (err) {
        console.error("[bookings] status change email error:", err);
      }
    })();
    // Send trip completion email when admin manually marks a booking completed
    if (parsed.data.status === "completed") {
      // Increment driver's totalRides counter
      if (booking.driverId) {
        db.update(driversTable)
          .set({ totalRides: sql`${driversTable.totalRides} + 1` })
          .where(eq(driversTable.id, booking.driverId))
          .catch(err => console.error("[bookings] totalRides increment error:", err));
      }
      (async () => {
        try {
          await sendTripCompletionEmail({
            id: booking.id,
            passengerName: booking.passengerName,
            passengerEmail: booking.passengerEmail,
            pickupAddress: booking.pickupAddress,
            dropoffAddress: booking.dropoffAddress,
            pickupAt: booking.pickupAt.toISOString(),
            vehicleClass: booking.vehicleClass ?? "standard",
            passengers: booking.passengers ?? 1,
            priceQuoted: parseFloat(String(booking.priceQuoted)),
          }, booking.tipAmount != null ? parseFloat(String(booking.tipAmount)) : null);
        } catch (err) {
          console.error("[bookings] trip completion email error:", err);
        }
      })();
      if (booking.userId) {
        maybeRewardReferrerForCompletedRide(booking.userId).catch(err =>
          console.error("[bookings] referral reward error:", err),
        );
      }
    }
  }

  // Fire-and-forget: notify the driver when an admin directly assigns/reassigns them —
  // unlike the open-pool self-accept flow, a direct assignment has no other signal
  // that tells the driver a trip now exists for them.
  if (booking.driverId != null && before?.driverId !== booking.driverId) {
    const assignedDriverId = booking.driverId;
    (async () => {
      try {
        const [driverUser] = await db
          .select({ email: usersTable.email, pushToken: driversTable.pushToken, pushPlatform: driversTable.pushPlatform })
          .from(driversTable)
          .innerJoin(usersTable, eq(driversTable.userId, usersTable.id))
          .where(eq(driversTable.id, assignedDriverId));
        if (!driverUser) return;

        const commissionPct = await getCommissionPct();
        const parsedBooking = parseBooking(booking);
        const driverEarnings = Math.round(parsedBooking.fareSubtotal * commissionPct * 100) / 100;
        const emailData = { ...parsedBooking, vehicleClass: parsedBooking.vehicleClass ?? "business", passengers: parsedBooking.passengers ?? 1, driverEarnings };

        const results = await Promise.allSettled([
          sendBookingAssignedDriver(emailData, driverUser.email),
          sendDriverAssignedPush({ pushToken: driverUser.pushToken, pushPlatform: driverUser.pushPlatform }, { id: booking.id, pickupAddress: booking.pickupAddress, driverEarnings }),
        ]);
        for (const r of results) {
          if (r.status === "rejected") console.error("[bookings] driver-assigned notification failed:", r.reason);
        }
      } catch (err) {
        console.error("[bookings] driver-assigned notification error:", err);
      }
    })();
  }
});

// Driver self-assigns a pending booking
router.post("/bookings/:id/accept", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }

  const caller = req.currentUser!;
  if (caller.role !== "driver") {
    res.status(403).json({ error: "Only drivers can accept bookings" });
    return;
  }

  const byUserId = await db
    .select({ id: driversTable.id, approvalStatus: driversTable.approvalStatus, complianceHold: driversTable.complianceHold, totalRides: driversTable.totalRides })
    .from(driversTable)
    .where(eq(driversTable.userId, caller.userId))
    .orderBy(desc(driversTable.totalRides));
  const driverRow = byUserId[0];

  if (!driverRow || driverRow.approvalStatus !== "approved") {
    res.status(403).json({ error: "Driver not approved" });
    return;
  }

  if (driverRow.complianceHold) {
    res.status(403).json({ error: "compliance_hold", message: "Your account is on a compliance hold due to an expired document. Please upload a renewed document to resume accepting rides." });
    return;
  }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  // "confirmed" with no driver = corporate booking (created confirmed, no
  // payment step) still waiting for a driver to claim it.
  if (!["pending", "authorized", "confirmed"].includes(booking.status) || booking.driverId != null) {
    res.status(400).json({ error: "Booking is already assigned or not available" });
    return;
  }

  const isAuthorized = booking.status === "authorized";

  if (isAuthorized && !booking.stripePaymentIntentId) {
    res.status(400).json({ error: "Booking has no payment intent to capture" });
    return;
  }

  // ── Scheduling conflict check ────────────────────────────────────────────────
  // Re-check busy windows even though the open-pool query already filtered them.
  // This guards against race conditions where a driver accepts another trip between
  // loading the list and tapping Accept.
  const busyWindows = await getDriverBusyWindows(driverRow.id);
  if (hasConflict(booking.pickupAt, busyWindows)) {
    res.status(409).json({
      error: "This trip conflicts with your existing schedule. You have another booking within 1 hour of this pickup time.",
      code: "SCHEDULE_CONFLICT",
    });
    return;
  }

  // Step 1: Atomically assign the driver (optimistic locking via isNull check).
  // We do this BEFORE Stripe capture so that if capture succeeds we have a
  // consistent DB record. If capture then fails we explicitly revert.
  // Optional: driver may specify which of their vehicles they're using for this trip
  const selectedVehicleId = typeof req.body?.vehicleId === "number" ? req.body.vehicleId as number : null;

  const acceptSet: Record<string, unknown> = { driverId: driverRow.id, status: "confirmed" };
  if (selectedVehicleId != null) acceptSet.selectedVehicleId = selectedVehicleId;

  const [updated] = await db
    .update(bookingsTable)
    .set(acceptSet)
    .where(and(eq(bookingsTable.id, id), isNull(bookingsTable.driverId)))
    .returning();

  if (!updated) {
    res.status(409).json({ error: "Booking was just taken by another driver" });
    return;
  }

  // Step 2: For authorized bookings, attempt Stripe capture now that the assignment is recorded.
  // On capture failure: revert booking to awaiting_payment + unassign driver + alert admin.
  if (isAuthorized) {
    try {
      const stripe = getStripe();
      await stripe.paymentIntents.capture(booking.stripePaymentIntentId!);
      // Capture succeeded — booking stays confirmed, continue to send emails below.
    } catch (stripeErr: any) {
      console.error(`[bookings] Stripe capture failed for booking #${id}:`, stripeErr.message);
      // Revert: unassign driver and move booking back to awaiting_payment so admin is alerted.
      await db
        .update(bookingsTable)
        .set({ driverId: null, status: "awaiting_payment", updatedAt: new Date() })
        .where(eq(bookingsTable.id, id));
      console.warn(`[bookings] Booking #${id} reverted to awaiting_payment after capture failure`);
      res.status(402).json({
        error: `Payment capture failed: ${stripeErr.message}. The booking is now back in awaiting payment — please contact the admin.`,
        captureError: true,
      });
      return;
    }
  }

  const commissionPct2 = await getCommissionPct();
  const parsedUpdated = parseBooking(updated);
  res.json(parsedUpdated);

  // Fire-and-forget emails
  (async () => {
    try {
      const [driverUser] = await db
        .select({ name: usersTable.name, email: usersTable.email, phone: driversTable.phone, vehicleYear: driversTable.vehicleYear, vehicleMake: driversTable.vehicleMake, vehicleModel: driversTable.vehicleModel, vehicleColor: driversTable.vehicleColor })
        .from(usersTable)
        .innerJoin(driversTable, eq(driversTable.userId, usersTable.id))
        .where(eq(usersTable.id, caller.userId));
      const bookingEmailData = { ...parsedUpdated, vehicleClass: parsedUpdated.vehicleClass ?? "business", passengers: parsedUpdated.passengers ?? 1, driverEarnings: Math.round(parsedUpdated.fareSubtotal * commissionPct2 * 100) / 100 };
      const vehicleDescription = [driverUser?.vehicleColor, driverUser?.vehicleYear, driverUser?.vehicleMake, driverUser?.vehicleModel].filter(Boolean).join(" ") || "Luxury Vehicle";

      const emailPromises: Promise<void>[] = [
        sendDriverAcceptedAdmin(bookingEmailData, driverUser?.name ?? "Driver", driverUser?.email ?? ""),
        sendDriverAcceptedPassenger(bookingEmailData, driverUser?.name ?? "Driver", driverUser?.phone ?? "", vehicleDescription),
      ];

      // For authorized (captured) bookings, also fire the post-payment confirmation emails
      // since they were deferred at authorization time
      if (isAuthorized) {
        const approvedDrivers = await db
          .select({ email: usersTable.email })
          .from(driversTable)
          .innerJoin(usersTable, eq(driversTable.userId, usersTable.id))
          .where(eq(driversTable.approvalStatus, "approved"));
        const driverEmails = approvedDrivers.map(d => d.email).filter(Boolean) as string[];
        const pushableDrivers = await db
          .select({ pushToken: driversTable.pushToken, pushPlatform: driversTable.pushPlatform })
          .from(driversTable)
          .where(and(eq(driversTable.status, "available"), eq(driversTable.complianceHold, false)));
        emailPromises.push(
          sendBookingConfirmationPassenger(bookingEmailData),
          sendNewBookingAdmin(bookingEmailData),
          sendNewBookingAvailableToDrivers(bookingEmailData, driverEmails),
          sendNewRideOfferPush(pushableDrivers, { id: bookingEmailData.id, pickupAddress: bookingEmailData.pickupAddress, driverEarnings: bookingEmailData.driverEarnings }),
        );
      }

      const results = await Promise.allSettled(emailPromises);
      for (const r of results) {
        if (r.status === "rejected") console.error("[bookings] accept notification failed:", r.reason);
      }
    } catch (err) {
      console.error("[bookings] accept email error:", err);
    }
  })();
});

// ─── Trip lifecycle endpoints (driver-only) ───────────────────────────────────

/**
 * Helper: verify the caller is the assigned driver for a booking.
 * Returns the driver DB row and booking row, or sends an error response.
 */
async function resolveAssignedDriver(
  req: import("express").Request,
  res: import("express").Response,
  bookingId: number,
): Promise<{ booking: typeof bookingsTable.$inferSelect; driverRow: { id: number; userId: number } } | null> {
  const caller = req.currentUser!;
  if (caller.role !== "driver") {
    res.status(403).json({ error: "Only drivers can update trip status" });
    return null;
  }

  // ORDER BY total_rides DESC so we always get the canonical (most-active) record
  // when a driver has multiple records linked to the same userId.
  const driverRows = await db
    .select({ id: driversTable.id, userId: driversTable.userId })
    .from(driversTable)
    .where(eq(driversTable.userId, caller.userId))
    .orderBy(desc(driversTable.totalRides));
  const driverRow = driverRows[0];

  if (!driverRow) {
    res.status(403).json({ error: "Driver profile not found" });
    return null;
  }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return null;
  }

  if (booking.driverId !== driverRow.id) {
    res.status(403).json({ error: "You are not assigned to this booking" });
    return null;
  }

  return { booking, driverRow };
}

// POST /bookings/:id/trip/checklist
// Driver marks pre-ride checklist complete — required before En Route can activate
router.post("/bookings/:id/trip/checklist", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid booking id" }); return; }

  const resolved = await resolveAssignedDriver(req, res, id);
  if (!resolved) return;
  const { booking } = resolved;

  if (!["confirmed", "on_way", "on_location"].includes(booking.status)) {
    res.status(400).json({ error: `Cannot complete checklist for booking in status: ${booking.status}` });
    return;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ checklistCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(bookingsTable.id, id))
    .returning();

  res.json({ ok: true, checklistCompletedAt: updated.checklistCompletedAt?.toISOString() ?? null });
});

// POST /bookings/:id/trip/on-way
// Requires: caller = assigned driver, booking status = confirmed, pickup within 60 min
router.post("/bookings/:id/trip/on-way", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid booking id" }); return; }

  const resolved = await resolveAssignedDriver(req, res, id);
  if (!resolved) return;
  const { booking } = resolved;

  if (booking.status !== "confirmed") {
    res.status(400).json({ error: `Cannot mark on-way from status: ${booking.status}` });
    return;
  }

  const minsUntilPickup = (new Date(booking.pickupAt).getTime() - Date.now()) / 60_000;
  if (minsUntilPickup > 60) {
    res.status(400).json({ error: "On the Way can only be activated within 60 minutes of pickup", minsUntilPickup: Math.round(minsUntilPickup) });
    return;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "on_way", updatedAt: new Date() })
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.status, "confirmed")))
    .returning();

  if (!updated) {
    res.status(409).json({ error: "Booking status has already changed — please refresh and try again." });
    return;
  }

  res.json(parseBooking(updated));

  // Fire-and-forget: notify passenger via email + SMS
  (async () => {
    try {
      const b = parseBooking(booking);
      const [driverRow] = await db.select().from(driversTable).where(eq(driversTable.id, booking.driverId!));
      const vehicleDesc = driverRow
        ? `${driverRow.vehicleYear ?? ""} ${driverRow.vehicleMake ?? ""} ${driverRow.vehicleModel ?? ""}`.trim()
        : (booking.vehicleClass ?? "vehicle");
      await Promise.allSettled([
        sendDriverOnWay({ ...b, vehicleClass: b.vehicleClass ?? "business", passengers: b.passengers ?? 1 }),
        sendDriverOnWaySms(booking.passengerPhone, driverRow?.name ?? "Your chauffeur", vehicleDesc),
      ]);
    } catch (err) { console.error("[bookings] on-way notification error:", err); }
  })();
});

// POST /bookings/:id/trip/on-location
// Requires: caller = assigned driver, booking status = on_way
router.post("/bookings/:id/trip/on-location", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid booking id" }); return; }

  const resolved = await resolveAssignedDriver(req, res, id);
  if (!resolved) return;
  const { booking } = resolved;

  if (booking.status !== "on_way") {
    res.status(400).json({ error: `Cannot mark arrived from status: ${booking.status}` });
    return;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "on_location", updatedAt: new Date() })
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.status, "on_way")))
    .returning();

  if (!updated) {
    res.status(409).json({ error: "Booking status has already changed — please refresh and try again." });
    return;
  }

  res.json(parseBooking(updated));

  // Fire-and-forget: notify passenger via email + SMS
  (async () => {
    try {
      const b = parseBooking(booking);
      const [driverRow] = await db.select().from(driversTable).where(eq(driversTable.id, booking.driverId!));
      await Promise.allSettled([
        sendDriverArrived({ ...b, vehicleClass: b.vehicleClass ?? "business", passengers: b.passengers ?? 1 }),
        sendDriverArrivedSms(booking.passengerPhone, driverRow?.name ?? "Your chauffeur"),
      ]);
    } catch (err) { console.error("[bookings] on-location notification error:", err); }
  })();
});

// POST /bookings/:id/trip/start
// Requires: caller = assigned driver, booking status = on_location
router.post("/bookings/:id/trip/start", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid booking id" }); return; }

  const resolved = await resolveAssignedDriver(req, res, id);
  if (!resolved) return;
  const { booking } = resolved;

  if (booking.status !== "on_location") {
    res.status(400).json({ error: `Cannot start trip from status: ${booking.status}` });
    return;
  }

  // For hourly charters, freeze the rate/limit defaults onto the booking now so
  // the check-reservation-status cron has stable values to compute overage from,
  // even if pricing defaults change later.
  const hourlySetFields = booking.charterMode === "hourly"
    ? {
        hourlyRate: booking.hourlyRate ?? String(HOURLY_RATES[booking.vehicleClass] ?? 95),
        maxMilesPerHour: booking.maxMilesPerHour ?? 30,
        extraMileRate: booking.extraMileRate ?? String(DEFAULT_RATE_PER_MILE[booking.vehicleClass] ?? 3.5),
      }
    : {};

  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "in_progress", tripStartedAt: new Date(), updatedAt: new Date(), ...hourlySetFields })
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.status, "on_location")))
    .returning();

  if (!updated) {
    res.status(409).json({ error: "Booking status has already changed — please refresh and try again." });
    return;
  }

  res.json(parseBooking(updated));
});

// POST /bookings/:id/trip/complete
// Requires: caller = assigned driver, booking status = in_progress
router.post("/bookings/:id/trip/complete", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid booking id" }); return; }

  const resolved = await resolveAssignedDriver(req, res, id);
  if (!resolved) return;
  const { booking } = resolved;

  if (booking.status !== "in_progress") {
    res.status(400).json({ error: `Cannot complete trip from status: ${booking.status}` });
    return;
  }

  const extraCharge = parseFloat(String(booking.extraCharge ?? "0")) || 0;
  const totalPrice = parseFloat(String(booking.priceQuoted)) + extraCharge;

  const [updated] = await db
    .update(bookingsTable)
    .set({
      status: "completed",
      tripEndedAt: new Date(),
      totalPrice: String(totalPrice),
      updatedAt: new Date(),
    })
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.status, "in_progress")))
    .returning();

  if (!updated) {
    res.status(409).json({ error: "Booking status has already changed — please refresh and try again." });
    return;
  }

  res.json(parseBooking(updated));

  // Increment driver's completed ride count (fire-and-forget)
  if (updated.driverId) {
    db.update(driversTable)
      .set({ totalRides: sql`${driversTable.totalRides} + 1` })
      .where(eq(driversTable.id, updated.driverId))
      .catch(err => console.error("[bookings] failed to increment totalRides:", err));
  }

  // Fire-and-forget: send trip completion email to passenger
  (async () => {
    try {
      await sendTripCompletionEmail({
        id: updated.id,
        passengerName: updated.passengerName,
        passengerEmail: updated.passengerEmail,
        pickupAddress: updated.pickupAddress,
        dropoffAddress: updated.dropoffAddress,
        pickupAt: updated.pickupAt.toISOString(),
        vehicleClass: updated.vehicleClass ?? "standard",
        passengers: updated.passengers ?? 1,
        priceQuoted: parseFloat(String(updated.priceQuoted)),
      }, updated.tipAmount != null ? parseFloat(String(updated.tipAmount)) : null, extraCharge > 0 ? extraCharge : null);
    } catch (err) {
      console.error("[bookings] trip completion email error:", err);
    }
  })();

  if (updated.userId) {
    maybeRewardReferrerForCompletedRide(updated.userId).catch(err =>
      console.error("[bookings] referral reward error:", err),
    );
  }
});

// Admin: unassign driver from a booking (puts it back in the open pool)
router.post("/bookings/:id/unassign", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }

  const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  if (!existing.driverId) {
    res.status(400).json({ error: "Booking has no driver assigned" });
    return;
  }

  const prevDriverId = existing.driverId;

  const [updated] = await db
    .update(bookingsTable)
    .set({ driverId: null, status: "pending" })
    .where(eq(bookingsTable.id, id))
    .returning();

  res.json(parseBooking(updated));

  // Fire-and-forget: notify admin
  (async () => {
    try {
      const [driverUser] = await db
        .select({ name: usersTable.name })
        .from(driversTable)
        .innerJoin(usersTable, eq(driversTable.userId, usersTable.id))
        .where(eq(driversTable.id, prevDriverId));
      await sendDriverUnassignedAdmin(id, driverUser?.name ?? `Driver #${prevDriverId}`, existing.passengerName);
    } catch (err) {
      console.error("[bookings] unassign email error:", err);
    }
  })();
});

// ─── Cancel preview — returns fee info without cancelling ─────────────────────

router.get("/bookings/:id/cancel-preview", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!id) { res.status(400).json({ error: "Invalid booking id" }); return; }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && booking.userId !== caller.userId) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const priceQuoted = parseFloat(String(booking.priceQuoted));
  const policy = getCancellationPolicy(booking.pickupAt, priceQuoted, booking.status);
  res.json(policy);
});

// ─── Cancel booking ───────────────────────────────────────────────────────────

router.delete("/bookings/:id", requireAuth, async (req, res): Promise<void> => {
  const params = CancelBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const caller = req.currentUser!;

  // Passengers/corporate can only cancel their own bookings in cancellable statuses
  if (caller.role !== "admin") {
    if (existing.userId !== caller.userId) {
      res.status(403).json({ error: "Access denied" }); return;
    }
    if (["completed", "cancelled", "in_progress"].includes(existing.status)) {
      res.status(400).json({ error: "This booking cannot be cancelled." }); return;
    }
  }

  const priceQuoted = parseFloat(String(existing.priceQuoted));
  const policy = getCancellationPolicy(existing.pickupAt, priceQuoted, existing.status);

  await db
    .update(bookingsTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(bookingsTable.id, params.data.id));

  res.json({ success: true, feePercent: policy.feePercent, feeAmount: policy.feeAmount, netRefund: policy.netRefund });

  // Fire-and-forget: void the Stripe payment intent on cancellation
  // - awaiting_payment: PI may not have been paid yet — try to cancel it so the customer cannot be charged
  // - authorized: card hold has been placed — cancel the PI to release the hold
  if (["awaiting_payment", "authorized"].includes(existing.status) && existing.stripePaymentIntentId) {
    (async () => {
      try {
        const stripe = getStripe();
        const pi = await stripe.paymentIntents.retrieve(existing.stripePaymentIntentId!);
        if (["requires_payment_method", "requires_confirmation", "requires_action", "requires_capture"].includes(pi.status)) {
          await stripe.paymentIntents.cancel(existing.stripePaymentIntentId!);
          console.log(`[bookings] PI cancelled on booking cancel for booking #${existing.id} (PI status was: ${pi.status})`);
        } else if (pi.status === "succeeded") {
          // Payment came through before we could cancel — issue a full refund
          await stripe.refunds.create({ payment_intent: existing.stripePaymentIntentId! });
          console.log(`[bookings] PI already succeeded on cancel for booking #${existing.id} — full refund issued`);
        } else {
          console.log(`[bookings] PI in unvoidable status '${pi.status}' for booking #${existing.id} — no action taken`);
        }
      } catch (err) {
        console.error("[bookings] Stripe PI cancel/refund failed on booking cancel:", err);
      }
    })();
  }

  // Fire-and-forget: email admin + passenger
  (async () => {
    try {
      const emailData = {
        ...parseBooking(existing),
        vehicleClass: existing.vehicleClass ?? "business",
        passengers: existing.passengers ?? 1,
      };
      await sendBookingCancelledAdmin(emailData);
      if (existing.passengerEmail) {
        await sendBookingCancelledPassenger(emailData, policy.feeAmount);
      }
    } catch (err) {
      console.error("[bookings] cancel email error:", err);
    }
  })();
});

// ─── Passenger: rate a driver after trip completion ──────────────────────────

router.post("/bookings/:id/rate", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid booking id" }); return; }

  const { rating, comment } = req.body as { rating?: number; comment?: string };
  if (!rating || rating < 1 || rating > 5) {
    res.status(400).json({ error: "Rating must be between 1 and 5" });
    return;
  }

  const caller = req.currentUser!;

  const [booking] = await db
    .select({ id: bookingsTable.id, status: bookingsTable.status, userId: bookingsTable.userId, driverId: bookingsTable.driverId })
    .from(bookingsTable)
    .where(eq(bookingsTable.id, id));

  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

  // Only the passenger who booked this ride can rate it
  if (booking.userId !== caller.userId) {
    res.status(403).json({ error: "You can only rate your own rides" });
    return;
  }

  if (booking.status !== "completed") {
    res.status(400).json({ error: "You can only rate a completed trip" });
    return;
  }

  if (!booking.driverId) {
    res.status(400).json({ error: "No driver assigned to this booking" });
    return;
  }

  // Prevent duplicate ratings
  const [existing] = await db
    .select({ id: reviewsTable.id })
    .from(reviewsTable)
    .where(eq(reviewsTable.bookingId, id));
  if (existing) {
    res.status(409).json({ error: "You have already rated this trip" });
    return;
  }

  const [review] = await db
    .insert(reviewsTable)
    .values({ bookingId: id, driverId: booking.driverId, userId: caller.userId, rating, comment: comment ?? null })
    .returning();

  res.json({ success: true, reviewId: review.id });

  // Recompute and persist driver's average rating (fire-and-forget).
  // Note: this used to run twice with different rounding (merge artifact from
  // two parallel sessions) — deduplicated to this single pass.
  const driverId = booking.driverId;
  db.select({ avg: sql<string>`avg(rating)::numeric(3,2)` })
    .from(reviewsTable)
    .where(eq(reviewsTable.driverId, driverId))
    .then(([row]) => {
      if (row?.avg != null) {
        return db.update(driversTable)
          .set({ rating: row.avg })
          .where(eq(driversTable.id, driverId));
      }
      return undefined;
    })
    .catch(err => console.error("[bookings] failed to update driver rating:", err));
});

export default router;
