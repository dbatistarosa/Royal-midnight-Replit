import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import Stripe from "stripe";
import { eq, desc, and, or, isNull, ne, sql, inArray } from "drizzle-orm";
import {
  db,
  bookingsTable,
  driversTable,
  settingsTable,
  usersTable,
  promoCodesTable,
  reviewsTable,
  extraServicesTable,
  bookingExtrasTable,
  driverVehiclesTable,
  managedTravelersTable,
  bookingDriverBlocksTable,
} from "@workspace/db";
import { requireAuth, requireAdmin, optionalAuth } from "../middleware/auth.js";
import { signedObjectDownloadPath } from "../lib/signedUrl.js";
import { hasPgErrorCode, UNDEFINED_COLUMN } from "../lib/pgError.js";
import { hasDriverBlockTable } from "../lib/schemaGuards.js";
import {
  loadZoneCoverage,
  isTripVisibleToDriver,
  loadPickupPoints,
  loadPickupPoint,
  savePickupPoint,
} from "../lib/serviceZones.js";
import { serializeBooking } from "../lib/serializeBooking.js";
import { recordAcceptance, recordAcceptances } from "../lib/legalAcceptance.js";
import {
  loadBookingExtras,
  loadExtrasFor,
  driverExtrasTotal,
} from "../lib/bookingExtras.js";
import {
  computeHourlyOverage,
  OVERAGE_GRACE_MINUTES,
} from "../lib/hourlyOverage.js";
import { computePostTripCharge } from "../lib/pricing.js";
import {
  saveFareBreakdown,
  saveOverageBreakdown,
  loadChargeRates,
  loadOverageFares,
  loadBookingReceipts,
} from "../lib/fareBreakdown.js";
import {
  fetchCommissionPct,
  driverEarningsForBooking,
} from "../lib/commission.js";
import {
  isMissingCustomerError,
  forgetStaleStripeCustomer,
} from "../lib/stripeCustomer.js";
import {
  driverBlockReason,
  driverBlockMessage,
} from "../lib/driverEligibility.js";
import { getDriverWindows } from "../lib/driverWindows.js";
import { getRouteEstimate, DEFAULT_DURATION_MINUTES } from "../lib/maps.js";
import {
  HOURLY_RATES,
  DEFAULT_RATE_PER_MILE,
  DEFAULT_MAX_MILES_PER_HOUR,
  computeQuote,
  readQuoteExtensions,
  resolveHourlyRate,
} from "./quote.js";
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
  sendExtraTimeChargedEmail,
} from "../lib/mailer.js";
import {
  sendDriverOnWaySms,
  sendDriverArrivedSms,
  sendCancellationSms,
} from "../lib/sms.js";
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
const ACTIVE_TRIP_STATUSES = [
  "confirmed",
  "in_progress",
  "on_way",
  "on_location",
] as const;

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
        or(...ACTIVE_TRIP_STATUSES.map((s) => eq(bookingsTable.status, s))),
      ),
    );

  return activeTrips.map((trip) => {
    const duration = trip.estimatedDurationMinutes ?? DEFAULT_DURATION_MINUTES;
    const pickup = trip.pickupAt.getTime();
    return {
      start: new Date(pickup - BUFFER_MS),
      end: new Date(pickup + duration * 60 * 1000 + BUFFER_MS),
    };
  });
}

/**
 * Returns true if the given pickup time falls inside ANY of the busy windows.
 */
function hasConflict(pickupAt: Date, windows: BusyWindow[]): boolean {
  const t = pickupAt.getTime();
  return windows.some((w) => t >= w.start.getTime() && t <= w.end.getTime());
}

/**
 * True when this error is Postgres 42703 (undefined_column).
 *
 * Drizzle wraps driver errors, so the pg error code is not on the object it
 * throws — it sits somewhere down the `cause` chain. Checking only the top
 * level silently misses every one of them.
 */
function isUndefinedColumn(err: unknown): boolean {
  return hasPgErrorCode(err, UNDEFINED_COLUMN);
}

const parseBooking = serializeBooking;

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

function getCancellationPolicy(
  pickupAt: Date,
  priceQuoted: number,
  status: string,
): CancelPreview {
  const now = new Date();
  const hoursUntilPickup =
    (pickupAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (["completed", "cancelled", "in_progress"].includes(status)) {
    return {
      canCancel: false,
      tier: "non_cancellable",
      feePercent: 0,
      feeAmount: 0,
      netRefund: 0,
      hoursUntilPickup,
      message:
        status === "in_progress"
          ? "This ride is currently in progress and cannot be cancelled."
          : "This booking cannot be cancelled.",
      priceQuoted,
    };
  }

  if (status === "awaiting_payment") {
    return {
      canCancel: true,
      tier: "free",
      feePercent: 0,
      feeAmount: 0,
      netRefund: priceQuoted,
      hoursUntilPickup,
      message:
        "No payment has been processed yet — you may cancel at no charge.",
      priceQuoted,
    };
  }

  // Policy (2026-07-15, set by owner):
  //   • 12h or more before pickup ........ no charge
  //   • 2–12h before pickup .............. 25% fee
  //   • under 2h before pickup / no-show . 100% charge
  if (hoursUntilPickup >= 12) {
    return {
      canCancel: true,
      tier: "free",
      feePercent: 0,
      feeAmount: 0,
      netRefund: priceQuoted,
      hoursUntilPickup,
      message:
        "Cancellations made 12 hours or more before pickup are fully refunded — no fee applies.",
      priceQuoted,
    };
  }

  if (hoursUntilPickup >= 2) {
    const feeAmount = Math.round(priceQuoted * 0.25 * 100) / 100;
    return {
      canCancel: true,
      tier: "partial_25",
      feePercent: 25,
      feeAmount,
      netRefund: Math.round((priceQuoted - feeAmount) * 100) / 100,
      hoursUntilPickup,
      message:
        "Cancellations made 2–12 hours before pickup incur a 25% cancellation fee.",
      priceQuoted,
    };
  }

  const feeAmount = Math.round(priceQuoted * 100) / 100;
  return {
    canCancel: true,
    tier: "full_100",
    feePercent: 100,
    feeAmount,
    netRefund: 0,
    hoursUntilPickup,
    message:
      "Cancellations made less than 2 hours before pickup (including no-shows) are charged in full.",
    priceQuoted,
  };
}

/**
 * Delegates to the shared reader rather than keeping a second copy.
 *
 * The copy that used to live here divided by 100 unconditionally, so the moment
 * `driver_commission_pct` was saved as "0.7" instead of "70" — which the admin
 * Settings screen happily accepts — every chauffeur in the fleet would have been
 * quoted 0.7% of the fare. lib/commission.ts normalises both forms.
 */
const getCommissionPct = fetchCommissionPct;

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2024-06-20" as const });
}

/**
 * Bill the extra-time charge to the card the passenger already has on file.
 *
 * The original PaymentIntent for this trip was captured for the quoted amount
 * and cannot be increased after the fact, so overtime is a second, separate
 * charge — the same shape as a gratuity.
 *
 * Never throws. The trip is already complete and the row already says what is
 * owed; a card that declines is a collections problem for dispatch, not a
 * reason to fail the chauffeur's "end trip" tap. Returns the PaymentIntent id
 * on success and null otherwise, and the null is what tells the admin screen
 * the money is still outstanding.
 */
async function chargeExtraTime(
  booking: { id: number; userId: number | null; passengerEmail: string },
  amount: number,
  log?: { warn: (obj: object, msg: string) => void },
): Promise<string | null> {
  if (amount <= 0) return null;

  if (booking.userId == null) {
    log?.warn(
      { bookingId: booking.id, amount },
      "extra_time_uncollected_no_account",
    );
    return null;
  }

  try {
    const [user] = await db
      .select({
        stripeCustomerId: usersTable.stripeCustomerId,
        defaultPaymentMethodId: usersTable.defaultPaymentMethodId,
      })
      .from(usersTable)
      .where(eq(usersTable.id, booking.userId));

    if (!user?.stripeCustomerId || !user.defaultPaymentMethodId) {
      log?.warn(
        { bookingId: booking.id, amount },
        "extra_time_uncollected_no_saved_card",
      );
      return null;
    }

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.create(
      {
        amount: Math.round(amount * 100),
        currency: "usd",
        customer: user.stripeCustomerId,
        payment_method: user.defaultPaymentMethodId,
        confirm: true,
        off_session: true,
        description: `Royal Midnight — Extra time for Booking #RM-${String(booking.id).padStart(4, "0")}`,
        metadata: { bookingId: String(booking.id), type: "extra_time" },
      },
      { idempotencyKey: `extra-time-${booking.id}` },
    );

    if (intent.status !== "succeeded") {
      log?.warn(
        { bookingId: booking.id, amount, status: intent.status },
        "extra_time_charge_not_succeeded",
      );
      return null;
    }
    return intent.id;
  } catch (err) {
    if (isMissingCustomerError(err) && booking.userId != null) {
      await forgetStaleStripeCustomer(booking.userId, log);
    }
    log?.warn(
      { bookingId: booking.id, amount, err: (err as Error).message },
      "extra_time_charge_failed",
    );
    return null;
  }
}

/** "Maria Gonzalez" -> "Maria G." — enough for a driver to tell one card from
 *  another in the open-pool list without publishing every passenger's full name
 *  to the whole fleet. */
function maskPassengerName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0]!;
  if (parts.length === 1) return first;
  return `${first} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`;
}

/**
 * What the chauffeur is shown for a trip, and what they will be paid for it.
 *
 * Three components, and they are paid on different terms:
 *
 *   fare      — commission on the undiscounted, pre-tax, pre-fee subtotal.
 *               Company promos and card fees never reduce it.
 *   overtime  — same commission. It is time worked like any other.
 *   extras    — the ones flagged paid_to_driver, in FULL with no commission.
 *               These are the chauffeur's own work or equipment (carrying a
 *               pet, fitting a car seat), so the company takes no share.
 *               Champagne and flowers are company goods and are excluded.
 *
 * Extras were previously absent from this entirely: they are not part of
 * fare_subtotal, so a chauffeur who fitted a car seat was paid nothing for it.
 */
function toDriverView<T extends { priceQuoted: number; fareSubtotal: number }>(
  booking: T,
  commissionPct: number,
  opts: { driverExtras?: number; overtimeFare?: number } = {},
): Omit<T, "priceQuoted" | "fareSubtotal"> & {
  driverEarnings: number;
  driverFareEarnings: number;
  driverExtrasEarnings: number;
  driverOvertimeEarnings: number;
} {
  const { priceQuoted, fareSubtotal, ...rest } = booking;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const driverFareEarnings = round2(fareSubtotal * commissionPct);
  // The PRE-TAX overtime charge, not bookings.extra_charge — that now includes
  // the tax and card fee the customer pays, and the chauffeur earns on neither.
  const driverOvertimeEarnings = round2(
    (opts.overtimeFare ?? 0) * commissionPct,
  );
  const driverExtrasEarnings = round2(opts.driverExtras ?? 0);

  return {
    ...rest,
    // Broken out as well as totalled so the driver can see why they are paid
    // what they are paid, rather than one number they cannot check.
    driverFareEarnings,
    driverOvertimeEarnings,
    driverExtrasEarnings,
    driverEarnings: round2(
      driverFareEarnings + driverOvertimeEarnings + driverExtrasEarnings,
    ),
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
  const isDriverPoolRequest =
    caller.role === "driver" &&
    (parsed.data.status === "pending" || parsed.data.status === "authorized") &&
    parsed.data.driverId == null;
  if (parsed.data.status && !isDriverPoolRequest)
    conditions.push(eq(bookingsTable.status, parsed.data.status));
  if (parsed.data.driverId != null)
    conditions.push(eq(bookingsTable.driverId, parsed.data.driverId));
  if (parsed.data.userId != null)
    conditions.push(eq(bookingsTable.userId, parsed.data.userId));
  if (parsed.data.startDate) {
    const d = new Date(parsed.data.startDate);
    if (isNaN(d.getTime())) {
      res
        .status(400)
        .json({
          error: "Invalid startDate — must be a parseable ISO date string.",
        });
      return;
    }
    conditions.push(sql`${bookingsTable.createdAt} >= ${d}`);
  }
  if (parsed.data.endDate) {
    const d = new Date(parsed.data.endDate);
    if (isNaN(d.getTime())) {
      res
        .status(400)
        .json({
          error: "Invalid endDate — must be a parseable ISO date string.",
        });
      return;
    }
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
  // Needed after this block to filter the pool by the driver's service zones.
  let poolDriverId: number | null = null;

  if (caller.role === "driver") {
    const requestedDriverId = parsed.data.driverId;
    const requestedStatus = parsed.data.status;

    if (requestedDriverId != null) {
      // When the frontend explicitly passes driverId, verify ownership directly from that
      // driver record. This is the most reliable path and avoids userId/email mismatch bugs
      // that occur when a driver has multiple records (onboarding + admin-created).
      const [targetDriver] = await db
        .select({
          id: driversTable.id,
          userId: driversTable.userId,
          email: driversTable.email,
        })
        .from(driversTable)
        .where(eq(driversTable.id, requestedDriverId));

      if (!targetDriver) {
        req.log.warn(
          {
            ip: req.ip,
            path: req.path,
            userId: req.currentUser?.userId,
            role: req.currentUser?.role,
          },
          "authorization_failed",
        );
        res.status(403).json({ error: "Access denied" });
        return;
      }

      // Verify caller owns this driver record (by userId or by email match)
      let authorized = targetDriver.userId === caller.userId;
      if (!authorized && targetDriver.email) {
        const [callerUser] = await db
          .select({ email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.id, caller.userId));
        authorized =
          !!callerUser?.email &&
          callerUser.email.toLowerCase() === targetDriver.email.toLowerCase();
        // Retroactively link so future requests use the fast path
        if (authorized && !targetDriver.userId) {
          db.update(driversTable)
            .set({ userId: caller.userId })
            .where(eq(driversTable.id, targetDriver.id))
            .catch((err) =>
              console.error(
                "[bookings] retroactive driver userId link error:",
                err,
              ),
            );
        }
      }

      if (!authorized) {
        req.log.warn(
          {
            ip: req.ip,
            path: req.path,
            userId: req.currentUser?.userId,
            role: req.currentUser?.role,
          },
          "authorization_failed",
        );
        res.status(403).json({ error: "Access denied" });
        return;
      }
      // driverId condition already added at line ~209 via parsed.data.driverId
    } else {
      // No explicit driverId — look up the driver by caller identity.
      // Order by total_rides DESC so we always get the most active record when
      // a driver has two entries (admin-created with history + onboarding record).
      const driverPoolColumns = {
        id: driversTable.id,
        totalRides: driversTable.totalRides,
        approvalStatus: driversTable.approvalStatus,
        complianceHold: driversTable.complianceHold,
        // Needed by driverBlockReason: the three-warning suspension writes
        // "paused" here, and nothing used to read it.
        status: driversTable.status,
      };
      const byUserId = await db
        .select(driverPoolColumns)
        .from(driversTable)
        .where(eq(driversTable.userId, caller.userId))
        .orderBy(desc(driversTable.totalRides));
      let driverRow:
        | {
            id: number;
            approvalStatus: string;
            complianceHold: boolean;
            status: string;
          }
        | undefined = byUserId[0];

      // Fallback: match by email if userId link was never set
      if (!driverRow) {
        const [callerUser] = await db
          .select({ email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.id, caller.userId));
        if (callerUser?.email) {
          const found = await db
            .select(driverPoolColumns)
            .from(driversTable)
            .where(eq(driversTable.email, callerUser.email))
            .orderBy(desc(driversTable.totalRides));
          driverRow = found[0];
          if (driverRow) {
            db.update(driversTable)
              .set({ userId: caller.userId })
              .where(eq(driversTable.id, driverRow.id))
              .catch((err) =>
                console.error(
                  "[bookings] retroactive driver userId link error:",
                  err,
                ),
              );
          }
        }
      }

      if (!driverRow) {
        res.json([]);
        return;
      }

      if (requestedStatus === "pending" || requestedStatus === "authorized") {
        // The open pool is the passenger list: who is being picked up, at which
        // address, at what time. POST /auth/driver-register is public and leaves
        // the account at approvalStatus="pending", so without this check anyone
        // could sign up as a driver and read it.
        //
        // POST /bookings/:id/accept already refuses a non-approved driver — the
        // check existed on the write and was missing on the read. Same criteria
        // here, deliberately including complianceHold: a driver with an expired
        // licence may not work, so they have no reason to see the queue either.
        const poolBlockReason = driverBlockReason(driverRow);
        if (poolBlockReason) {
          req.log.warn(
            {
              ip: req.ip,
              path: req.path,
              userId: caller.userId,
              driverId: driverRow.id,
              reason: poolBlockReason,
            },
            "authorization_failed",
          );
          res.json([]);
          return;
        }
        // A trip taken off this driver for missing the confirmation deadline
        // goes back to the pool for everyone else — but must never be offered
        // to them again, or it would reappear moments after being removed.
        // Skipped entirely until migration 0008 has run: with no table there
        // can be no blocks, and referencing it would take the pool down.
        if (await hasDriverBlockTable()) {
          conditions.push(sql`NOT EXISTS (
          SELECT 1 FROM booking_driver_blocks bdb
           WHERE bdb.booking_id = ${bookingsTable.id}
             AND bdb.driver_id  = ${driverRow.id}
        )`);
        }
        // Requesting the open/unassigned pool — includes pending and authorized
        // bookings, plus corporate bookings (those are created directly as
        // "confirmed" with no payment step and still need a driver to accept).
        // Pre-fetch this driver's busy windows so conflicting trips can be hidden below.
        conditions.push(isNull(bookingsTable.driverId));
        conditions.push(
          inArray(bookingsTable.status, ["pending", "authorized", "confirmed"]),
        );
        isDriverOpenPoolQuery = true;
        poolDriverId = driverRow.id;
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
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
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
        and(
          eq(bookingsTable.passengerEmail, userEmail),
          isNull(bookingsTable.userId),
        ),
      )!,
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

    // Extras attached here too. This branch was the one that got missed, which
    // is why the admin list showed no add-ons while the driver portal did.
    const adminExtras = await loadBookingExtras(rows.map((r) => r.booking.id));
    // The recorded money breakdown, so dispatch can see what tax and card fee a
    // booking actually carried — and, on a completed charter, whether the extra
    // time was ever collected.
    const adminReceipts = await loadBookingReceipts(
      rows.map((r) => r.booking.id),
    );
    res.json(
      rows.map(({ booking, userRole }) => ({
        ...parseBooking(booking),
        extras: adminExtras.get(booking.id) ?? [],
        receipt: adminReceipts.get(booking.id) ?? null,
        userRole: userRole ?? null,
      })),
    );
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
      driverBookings = parsed2.filter(
        (b) => !hasConflict(new Date(b.pickupAt), driverBusyWindows),
      );
    }

    // ...and trips outside the driver's service areas. Coverage is read once
    // per request; the per-booking test is then pure geometry with no further
    // queries. A trip whose pickup no staffed zone covers stays visible to
    // everyone rather than vanishing — see lib/serviceZones.ts.
    if (isDriverOpenPoolQuery && poolDriverId != null) {
      const coverage = await loadZoneCoverage(poolDriverId);
      if (coverage.enabled) {
        const points = await loadPickupPoints(driverBookings.map((b) => b.id));
        driverBookings = driverBookings.filter((b) =>
          isTripVisibleToDriver(points.get(b.id) ?? null, coverage),
        );
      }
    }

    // The open pool is a broadcast: every approved driver in the fleet sees it,
    // and all but one of them will never take the trip. What they need to
    // decide is where, when, and what it pays. Contact details, free-text
    // requests and VIP notes are withheld until the trip is actually assigned —
    // the driver who accepts gets them from GET /bookings (assigned branch) and
    // GET /bookings/:id. vipNotes in particular is admin-only elsewhere:
    // PATCH /users/:id refuses to let anyone but an admin write it.
    if (isDriverOpenPoolQuery) {
      // Extras ARE included in the broadcast, unlike contact details: a car
      // seat or a pet changes whether a driver can take the trip at all, so
      // withholding it until acceptance would mean accepting blind. They carry
      // no personal information.
      const poolExtras = await loadBookingExtras(
        driverBookings.map((b) => b.id),
      );
      res.json(
        driverBookings.map((b) => {
          const extras = poolExtras.get(b.id) ?? [];
          return {
            ...toDriverView(b, commissionPct, {
              driverExtras: driverExtrasTotal(extras),
            }),
            extras,
            passengerName: maskPassengerName(
              (b as { passengerName?: unknown }).passengerName,
            ),
            passengerEmail: null,
            passengerPhone: null,
            specialRequests: null,
            passengerPreferences: null,
          };
        }),
      );
      return;
    }

    // Attach passenger preferences so the driver can stage the vehicle correctly.
    // Batch-fetch preferences for all unique userIds in this response.
    const userIds = [
      ...new Set(
        driverBookings
          .map((b) => (b as any).userId)
          .filter(Boolean) as number[],
      ),
    ];
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
            : inArray(usersTable.id, userIds),
        );
      for (const p of prefRows) {
        const { id, ...prefs } = p;
        // Only include if at least one preference is set
        if (Object.values(prefs).some((v) => v != null && v !== false)) {
          prefsByUserId.set(id, prefs);
        }
      }
    }

    const assignedExtras = await loadBookingExtras(
      driverBookings.map((b) => b.id),
    );
    const overtimeFares = await loadOverageFares(
      driverBookings.map((b) => b.id),
    );
    res.json(
      driverBookings.map((b) => {
        const extras = assignedExtras.get(b.id) ?? [];
        const view = toDriverView(b, commissionPct, {
          driverExtras: driverExtrasTotal(extras),
          // Rows from before the split stored the untaxed figure in extra_charge.
          overtimeFare:
            overtimeFares.get(b.id) ??
            (parseFloat(
              String((b as { extraCharge?: unknown }).extraCharge ?? "0"),
            ) ||
              0),
        });
        const uid = (b as any).userId as number | null;
        const passengerPreferences = uid
          ? (prefsByUserId.get(uid) ?? null)
          : null;
        return { ...view, extras, passengerPreferences };
      }),
    );
    return;
  }

  // Return data as-is for passenger/corporate — skip Zod re-validation to avoid
  // enum mismatches from legacy seeded rows with old vehicleClass values.
  // Extras are attached because the passenger paid for them and had no way to
  // see, on any screen, what they had actually booked.
  const listExtras = await loadBookingExtras(parsed2.map((b) => b.id));
  res.json(parsed2.map((b) => ({ ...b, extras: listExtras.get(b.id) ?? [] })));
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
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
      res
        .status(403)
        .json({
          error:
            "Corporate account bookings require a corporate or admin account",
        });
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
        .where(
          and(
            eq(managedTravelersTable.eaUserId, caller.userId),
            eq(managedTravelersTable.travelerId, requestedUserId),
          ),
        );
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

  // Extras are priced from extra_services, never from the body — and priced
  // BEFORE the quote, because they are part of the taxable base. They used to
  // be added to the total after tax and the card fee had already been computed,
  // so add-ons were the one line on the invoice that carried neither.
  const requestedExtras = parsed.data.extras ?? [];
  const pricedExtras: Array<{ id: number; quantity: number; price: number }> =
    [];
  if (requestedExtras.length) {
    const services = await db
      .select({ id: extraServicesTable.id, price: extraServicesTable.price })
      .from(extraServicesTable)
      .where(
        and(
          inArray(
            extraServicesTable.id,
            requestedExtras.map((e) => e.id),
          ),
          eq(extraServicesTable.isActive, true),
        ),
      );
    for (const s of services) {
      pricedExtras.push({
        id: s.id,
        quantity: requestedExtras.find((e) => e.id === s.id)?.quantity ?? 1,
        price: parseFloat(String(s.price)) || 0,
      });
    }
  }
  const extrasTotal =
    Math.round(
      pricedExtras.reduce((sum, e) => sum + e.price * e.quantity, 0) * 100,
    ) / 100;

  const quoteOutcome = await computeQuote({
    pickupAddress: parsed.data.pickupAddress,
    dropoffAddress: parsed.data.dropoffAddress,
    vehicleClass: parsed.data.vehicleClass as string,
    pickupAt: parsed.data.pickupAt,
    waypoints: ext.waypoints,
    charterMode: ext.charterMode,
    charterHours: ext.charterHours,
    extrasTotal,
    userId:
      isCorporate && caller?.role === "corporate"
        ? caller.userId
        : (bookingUserId ?? undefined),
    // Admins take phone bookings for trips that may be imminent, and may agree
    // a charter block shorter than the published minimum.
    skipLeadTimeCheck: caller?.role === "admin",
    skipCharterMinimumCheck: caller?.role === "admin",
  });
  if (!quoteOutcome.ok) {
    res.status(quoteOutcome.status).json(quoteOutcome.body);
    return;
  }
  const quote = quoteOutcome.quote;

  // Promo discount is re-derived from the promo_codes row. An invalid or
  // exhausted code yields no discount rather than failing the whole booking.
  // totalWithTax already contains the add-ons, taxed and fee'd.
  const grossTotal = quote.totalWithTax;
  let discountAmount = 0;
  let appliedPromoCode: string | null = null;
  if (parsed.data.promoCode) {
    // bookingUserId, so a per-customer limit is counted against the passenger
    // this booking is actually for — including an assistant booking on a
    // traveller's behalf, where the traveller is the one holding the offer.
    const promo = await evaluatePromoCode(
      parsed.data.promoCode,
      grossTotal,
      bookingUserId,
    );
    if (promo.valid && promo.discountAmount != null) {
      discountAmount = promo.discountAmount;
      appliedPromoCode = promo.code;
    }
  }

  const priceQuoted = Math.max(
    0,
    Math.round((grossTotal - discountAmount) * 100) / 100,
  );
  // Driver commission base: base fare + billable miles (+surge) only. Taxes,
  // the card fee, promo discounts and the airport fee are all company-side —
  // the driver never earns on them. Flat routes pay commission on the flat price.
  const fareSubtotal =
    quote.fixedRoutePrice ??
    Math.round(
      (quote.baseFare + quote.distanceCharge + quote.surgeAdjustment) * 100,
    ) / 100;

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

  // The hourly rate this charter was actually quoted at: the admin-set rate for
  // the vehicle class if there is one, otherwise the built-in default. Resolved
  // here so it can be frozen onto the booking below.
  const hourlyRateForBooking = await resolveHourlyRate(
    parsed.data.vehicleClass as string,
  );

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
    // The trip's own shape, which was priced and then thrown away.
    //
    // readQuoteExtensions() has always read charterMode/charterHours/waypoints
    // off the body and computeQuote() has always priced them — an hourly
    // charter was billed at the hourly rate correctly. But none of the three
    // was ever written to the row, so every booking was stored as a plain
    // point-to-point transfer with charter_mode NULL. Nothing downstream could
    // tell an hourly charter from an airport run: not the driver's manifest,
    // not the passenger's receipt, not the admin list, and not the overage
    // timer, which needs charter_hours to know what was contracted.
    charterMode: ext.charterMode === "hourly" ? "hourly" : null,
    charterHours:
      ext.charterMode === "hourly" ? (ext.charterHours ?? null) : null,
    waypoints: ext.waypoints?.length ? JSON.stringify(ext.waypoints) : null,
    // Frozen now rather than at trip start so the passenger's receipt can show
    // the terms they agreed to, and so overage is computed against the rate
    // quoted at booking even if pricing changes in between.
    hourlyRate:
      ext.charterMode === "hourly" ? String(hourlyRateForBooking) : null,
    maxMilesPerHour:
      ext.charterMode === "hourly" ? DEFAULT_MAX_MILES_PER_HOUR : null,
    // Corporate bookings are confirmed immediately; fully-discounted bookings skip
    // payment and go straight to pending (open driver pool). Everyone else
    // (including admin-manual) awaits payment.
    status: isCorporate
      ? "confirmed"
      : isFreeBooking
        ? "pending"
        : "awaiting_payment",
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
    [booking] = (await db
      .insert(bookingsTable)
      .values(bookingValues)
      .returning()) as [typeof bookingsTable.$inferSelect];
  } catch (err: unknown) {
    if (!isUndefinedColumn(err)) throw err;
    console.error(
      "[bookings] tracking_token column is missing — run migration 0004_booking_tracking_token.sql. " +
        "Falling back to creating this booking without a tracking token.",
    );
    const { trackingToken: _omitted, ...withoutToken } = bookingValues;
    [booking] = (await db
      .insert(bookingsTable)
      .values(withoutToken)
      .returning()) as [typeof bookingsTable.$inferSelect];
  }

  // The passenger ticked the terms box on the final booking step. Recorded
  // against this specific reservation, because that is the act being agreed to
  // — the cancellation policy in particular is per-booking. Non-blocking: the
  // booking exists and was paid for, and losing the audit row must not undo it.
  void recordAcceptances(req, ["terms", "privacy"], {
    bookingId: booking.id,
    userId: bookingUserId ?? null,
    email: parsed.data.passengerEmail,
  });

  // Cache the geocoded pickup so the driver service-area filter never has to
  // geocode a pending booking on a pool refresh. Fire-and-forget, and written
  // through a guarded raw statement rather than the drizzle schema — see the
  // note in lib/db/src/schema/bookings.ts. A booking that cannot be created is
  // a far worse outcome than one without coordinates, which the filter treats
  // as "location unknown" and shows to every driver.
  if (quote.pickupPoint) {
    void savePickupPoint(booking.id, quote.pickupPoint, req.log);
  }

  // What this booking was actually charged, line by line, frozen at today's
  // rates. Without it the revenue report can only guess, and it guessed badly:
  // everything that was not the commission base got counted as Florida tax.
  void saveFareBreakdown(
    booking.id,
    {
      taxAmount: quote.taxAmount,
      cardFee: quote.cardProcessingFee,
      airportFee: quote.airportFee,
      extrasTotal: quote.extrasTotal,
    },
    req.log,
  ).catch((err) =>
    console.error("[bookings] fare breakdown save failed:", err),
  );

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
      const estimate = await getRouteEstimate(
        booking.pickupAddress,
        booking.dropoffAddress,
      );
      const durationMinutes =
        estimate?.durationMinutes ?? DEFAULT_DURATION_MINUTES;
      const distanceMiles = estimate?.distanceMiles ?? null;
      await db
        .update(bookingsTable)
        .set({
          estimatedDurationMinutes: durationMinutes,
          estimatedDistanceMiles:
            distanceMiles != null ? String(distanceMiles) : null,
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
          console.log(
            `[bookings] Linked booking #${booking.id} to existing user #${existingUser.id} (${booking.passengerEmail})`,
          );
        } else {
          // New passenger — send invitation to create an account
          await sendAccountInvitation({
            passengerName: booking.passengerName,
            passengerEmail: booking.passengerEmail,
            bookingId: booking.id,
          });
          console.log(
            `[bookings] Sent account invitation to new passenger: ${booking.passengerEmail}`,
          );
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
        await db
          .insert(bookingExtrasTable)
          .values(
            pricedExtras.map((e) => ({
              bookingId: booking.id,
              extraServiceId: e.id,
              quantity: e.quantity,
              priceAtBooking: String(e.price),
            })),
          )
          .onConflictDoNothing();
      } catch (err) {
        console.error("[bookings] extras insert failed:", err);
      }
    })();
  }

  // If a promo code was used, increment its usedCount (non-blocking)
  if (booking.promoCode) {
    db.update(promoCodesTable)
      .set({ usedCount: sql`${promoCodesTable.usedCount} + 1` })
      .where(eq(promoCodesTable.code, booking.promoCode))
      .catch((err) =>
        console.error("[bookings] promoCode usedCount increment failed:", err),
      );
  }

  // Corporate and fully-discounted bookings: fire emails immediately since there's no payment step
  if (isCorporate || isFreeBooking) {
    (async () => {
      try {
        const parsed2 = parseBooking(booking);
        const commissionPct = await getCommissionPct();
        const driverEarnings = await driverEarningsForBooking(
          booking.id,
          parsed2.fareSubtotal,
          commissionPct,
        );
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
        const driverEmails = approvedDrivers
          .map((d) => d.email)
          .filter(Boolean) as string[];

        const pushableDrivers = await db
          .select({
            pushToken: driversTable.pushToken,
            pushPlatform: driversTable.pushPlatform,
          })
          .from(driversTable)
          .where(
            and(
              eq(driversTable.status, "available"),
              eq(driversTable.complianceHold, false),
            ),
          );

        // Each notification is independent — one failing (e.g. a bad template field)
        // must never silently prevent the others from firing, especially the driver
        // fan-out, which is how drivers learn a ride is available to claim.
        const results = await Promise.allSettled([
          sendBookingConfirmationPassenger(emailData),
          sendNewBookingAdmin(emailData),
          sendNewBookingAvailableToDrivers(emailData, driverEmails),
          sendNewRideOfferPush(pushableDrivers, {
            id: booking.id,
            pickupAddress: booking.pickupAddress,
            driverEarnings,
          }),
        ]);
        for (const r of results) {
          if (r.status === "rejected")
            console.error(
              "[bookings] post-create notification failed:",
              r.reason,
            );
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
    [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.trackingToken, token));
  } catch (err: unknown) {
    // Same migration window as booking creation — see the insert above.
    if (!isUndefinedColumn(err)) throw err;
    console.error(
      "[bookings] tracking_token column is missing — run migration 0004_booking_tracking_token.sql",
    );
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
    discountAmount: booking.discountAmount
      ? parseFloat(booking.discountAmount)
      : null,
    promoCode: booking.promoCode ?? null,
    paymentType: booking.paymentType ?? null,
  });
});

// Driver info for passenger — reveals phone, vehicle, and plate only within 48h of pickup.
// This keeps personal contact details private until the trip is close enough to be relevant.
router.get(
  "/bookings/:id/driver-info",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetBookingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, params.data.id));
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    // The old condition short-circuited on `caller.role !== "driver"`, so ANY
    // driver account — not just the assigned one — got driverName, driverPhone
    // and regPlate for an arbitrary booking id. Chained with the open driver
    // registration that was trivial to reach.
    //
    // The `passengerEmail !== (caller as any).email` term was also dead: AuthUser
    // is {userId, role} and never carries an email, so it was always true. Its
    // real-world effect was a passenger whose booking is linked only by email
    // (created by an admin) getting a 403 they should not have. Both fixed here,
    // matching the pattern GET /bookings/:id already uses.
    const caller = req.currentUser!;
    if (caller.role === "driver") {
      const [driverRow] = await db
        .select({ id: driversTable.id })
        .from(driversTable)
        .where(eq(driversTable.userId, caller.userId));
      if (!driverRow || booking.driverId !== driverRow.id) {
        req.log.warn(
          {
            ip: req.ip,
            path: req.path,
            userId: caller.userId,
            role: caller.role,
          },
          "authorization_failed",
        );
        res.status(403).json({ error: "Access denied" });
        return;
      }
    } else if (caller.role !== "admin" && booking.userId !== caller.userId) {
      const [callerUser] = await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, caller.userId));
      if (!callerUser?.email || booking.passengerEmail !== callerUser.email) {
        req.log.warn(
          {
            ip: req.ip,
            path: req.path,
            userId: caller.userId,
            role: caller.role,
          },
          "authorization_failed",
        );
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }

    if (!booking.driverId) {
      res.json({ available: false, reason: "no_driver" });
      return;
    }

    const ACTIVE_STATUSES = [
      "on_way",
      "on_location",
      "in_progress",
      "completed",
      "cancelled",
    ];
    const hoursUntilPickup =
      (new Date(booking.pickupAt).getTime() - Date.now()) / (1000 * 60 * 60);
    const withinWindow =
      hoursUntilPickup <= 48 || ACTIVE_STATUSES.includes(booking.status);

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

    if (!driver) {
      res.json({ available: false, reason: "driver_not_found" });
      return;
    }

    // Prefer the vehicle the driver actually chose for THIS trip (multi-vehicle
    // drivers pick one at accept time); fall back to the legacy driver fields.
    let vehicleDescription = "";
    let regPlate: string | null = driver.regPlate ?? null;
    if (booking.selectedVehicleId != null) {
      const [selected] = await db
        .select({
          year: driverVehiclesTable.year,
          make: driverVehiclesTable.make,
          model: driverVehiclesTable.model,
          color: driverVehiclesTable.color,
          regPlate: driverVehiclesTable.regPlate,
        })
        .from(driverVehiclesTable)
        .where(eq(driverVehiclesTable.id, booking.selectedVehicleId));
      if (selected) {
        vehicleDescription = [
          selected.color,
          selected.year,
          selected.make,
          selected.model,
        ]
          .filter(Boolean)
          .join(" ");
        regPlate = selected.regPlate ?? regPlate;
      }
    }
    if (!vehicleDescription) {
      vehicleDescription =
        [
          driver.vehicleColor,
          driver.vehicleYear,
          driver.vehicleMake,
          driver.vehicleModel,
        ]
          .filter(Boolean)
          .join(" ") || "Luxury Vehicle";
    }

    res.json({
      available: true,
      driverName: driver.name,
      driverPhone: driver.phone,
      vehicleDescription,
      regPlate,
      // Signed here rather than by the client: the passenger does not own this
      // object, and letting them sign an arbitrary path would reopen access to
      // every driver's licence and insurance scan.
      profilePicture: signedObjectDownloadPath(driver.profilePicture),
    });
  },
);

// Authenticated single-booking endpoint
router.get("/bookings/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, params.data.id));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const caller = req.currentUser!;

  // Authenticated driver: can only access their own assigned bookings; receive driver-view (no priceQuoted)
  if (caller.role === "driver") {
    const [driverRow] = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.userId, caller.userId));
    if (!driverRow || booking.driverId !== driverRow.id) {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const commissionPct = await getCommissionPct();
    const extras = await loadExtrasFor(booking.id);
    const overtimeFares = await loadOverageFares([booking.id]);
    res.json({
      ...toDriverView(parseBooking(booking), commissionPct, {
        driverExtras: driverExtrasTotal(extras),
        overtimeFare:
          overtimeFares.get(booking.id) ??
          (parseFloat(String(booking.extraCharge ?? "0")) || 0),
      }),
      extras,
    });
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
        req.log.warn(
          {
            ip: req.ip,
            path: req.path,
            userId: req.currentUser?.userId,
            role: req.currentUser?.role,
          },
          "authorization_failed",
        );
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }
  }

  // For passengers/corporate: include existing rating if any
  if (
    caller.role === "passenger" ||
    caller.role === "corporate" ||
    caller.role === "admin"
  ) {
    const [existingReview] = await db
      .select({ rating: reviewsTable.rating, comment: reviewsTable.comment })
      .from(reviewsTable)
      .where(eq(reviewsTable.bookingId, params.data.id));
    const base = parseBooking(booking);
    // The stored receipt lines, so the passenger's receipt can print what was
    // actually charged instead of the 80/20 split it used to guess.
    const receipts = await loadBookingReceipts([booking.id]);
    res.json({
      ...base,
      extras: await loadExtrasFor(booking.id),
      receipt: receipts.get(booking.id) ?? null,
      hasRating: existingReview != null,
      existingRating: existingReview?.rating ?? null,
      existingComment: existingReview?.comment ?? null,
    });
    return;
  }

  res.json({
    ...parseBooking(booking),
    extras: await loadExtrasFor(booking.id),
  });
});

// GET /bookings/:id/flight-status — live flight status for bookings with a flight number.
// Accessible by the passenger (own booking), their assigned driver, and admins.
router.get(
  "/bookings/:id/flight-status",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const caller = req.currentUser!;
    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id));
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    // Access control: passenger (own booking), assigned driver, or admin
    if (caller.role === "passenger" || caller.role === "corporate") {
      if (booking.userId !== caller.userId) {
        const [callerUser] = await db
          .select({ email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.id, caller.userId));
        if (!callerUser || booking.passengerEmail !== callerUser.email) {
          req.log.warn(
            {
              ip: req.ip,
              path: req.path,
              userId: req.currentUser?.userId,
              role: req.currentUser?.role,
            },
            "authorization_failed",
          );
          res.status(403).json({ error: "Access denied" });
          return;
        }
      }
    } else if (caller.role === "driver") {
      const [driverRow] = await db
        .select({ id: driversTable.id })
        .from(driversTable)
        .where(eq(driversTable.userId, caller.userId));
      if (!driverRow || booking.driverId !== driverRow.id) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    } else if (caller.role !== "admin") {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (!booking.flightNumber) {
      res.json({ available: false, reason: "no_flight_number" });
      return;
    }

    const { getFlightStatus, isFlightStatusConfigured } =
      await import("../lib/flightStatus.js");

    if (!isFlightStatusConfigured()) {
      res.json({
        available: false,
        reason: "not_configured",
        flightNumber: booking.flightNumber,
      });
      return;
    }

    const status = await getFlightStatus(booking.flightNumber);
    if (!status) {
      res.json({
        available: false,
        reason: "not_found",
        flightNumber: booking.flightNumber,
      });
      return;
    }

    res.json({ available: true, ...status });
  },
);

// GET /bookings/:id/driver-location — passenger-accessible live driver position.
// Only returns data when booking status is on_way or on_location and driver has shared coords.
router.get(
  "/bookings/:id/driver-location",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const caller = req.currentUser!;
    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id));
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    // Passengers: only their own bookings
    if (caller.role === "passenger" || caller.role === "corporate") {
      if (booking.userId !== caller.userId) {
        const [callerUser] = await db
          .select({ email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.id, caller.userId));
        if (!callerUser || booking.passengerEmail !== callerUser.email) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
      }
    } else if (caller.role !== "admin") {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Only active while driver is on the way or on location
    if (!["on_way", "on_location"].includes(booking.status)) {
      res.json({ available: false, status: booking.status });
      return;
    }

    if (!booking.driverId) {
      res.json({ available: false, status: booking.status });
      return;
    }

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
      res.json({
        available: false,
        status: booking.status,
        reason: "no_location",
      });
      return;
    }

    res.json({
      available: true,
      status: booking.status,
      lat: parseFloat(driver.latitude),
      lng: parseFloat(driver.longitude),
      driverName: driver.name,
      locationUpdatedAt: driver.locationUpdatedAt
        ? driver.locationUpdatedAt.toISOString()
        : null,
      pickupAddress: booking.pickupAddress,
      dropoffAddress: booking.dropoffAddress,
      pickupLat: null,
      pickupLng: null,
    });
  },
);

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

  const [before] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, params.data.id));

  const updateData: Record<string, unknown> = {};
  if (parsed.data.status != null) updateData.status = parsed.data.status;
  if (parsed.data.driverId !== undefined)
    updateData.driverId = parsed.data.driverId;
  if (parsed.data.vehicleId !== undefined)
    updateData.vehicleId = parsed.data.vehicleId;
  if (parsed.data.specialRequests !== undefined)
    updateData.specialRequests = parsed.data.specialRequests;

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
        await sendStatusChangedAdmin(
          booking.id,
          before.status,
          booking.status,
          booking.passengerName,
        );
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
          .catch((err) =>
            console.error("[bookings] totalRides increment error:", err),
          );
      }
      (async () => {
        try {
          await sendTripCompletionEmail(
            {
              id: booking.id,
              passengerName: booking.passengerName,
              passengerEmail: booking.passengerEmail,
              pickupAddress: booking.pickupAddress,
              dropoffAddress: booking.dropoffAddress,
              pickupAt: booking.pickupAt.toISOString(),
              vehicleClass: booking.vehicleClass ?? "standard",
              passengers: booking.passengers ?? 1,
              priceQuoted: parseFloat(String(booking.priceQuoted)),
            },
            booking.tipAmount != null
              ? parseFloat(String(booking.tipAmount))
              : null,
          );
        } catch (err) {
          console.error("[bookings] trip completion email error:", err);
        }
      })();
      if (booking.userId) {
        maybeRewardReferrerForCompletedRide(booking.userId).catch((err) =>
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
          .select({
            email: usersTable.email,
            pushToken: driversTable.pushToken,
            pushPlatform: driversTable.pushPlatform,
          })
          .from(driversTable)
          .innerJoin(usersTable, eq(driversTable.userId, usersTable.id))
          .where(eq(driversTable.id, assignedDriverId));
        if (!driverUser) return;

        const commissionPct = await getCommissionPct();
        const parsedBooking = parseBooking(booking);
        const driverEarnings = await driverEarningsForBooking(
          booking.id,
          parsedBooking.fareSubtotal,
          commissionPct,
        );
        const emailData = {
          ...parsedBooking,
          vehicleClass: parsedBooking.vehicleClass ?? "business",
          passengers: parsedBooking.passengers ?? 1,
          driverEarnings,
        };

        const results = await Promise.allSettled([
          sendBookingAssignedDriver(emailData, driverUser.email),
          sendDriverAssignedPush(
            {
              pushToken: driverUser.pushToken,
              pushPlatform: driverUser.pushPlatform,
            },
            {
              id: booking.id,
              pickupAddress: booking.pickupAddress,
              driverEarnings,
            },
          ),
        ]);
        for (const r of results) {
          if (r.status === "rejected")
            console.error(
              "[bookings] driver-assigned notification failed:",
              r.reason,
            );
        }
      } catch (err) {
        console.error("[bookings] driver-assigned notification error:", err);
      }
    })();
  }
});

// Driver self-assigns a pending booking
router.post(
  "/bookings/:id/accept",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const caller = req.currentUser!;
    if (caller.role !== "driver") {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
      res.status(403).json({ error: "Only drivers can accept bookings" });
      return;
    }

    const byUserId = await db
      .select({
        id: driversTable.id,
        approvalStatus: driversTable.approvalStatus,
        complianceHold: driversTable.complianceHold,
        status: driversTable.status,
        totalRides: driversTable.totalRides,
      })
      .from(driversTable)
      .where(eq(driversTable.userId, caller.userId))
      .orderBy(desc(driversTable.totalRides));
    const driverRow = byUserId[0];

    if (!driverRow) {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
      res.status(403).json({ error: "Driver not approved" });
      return;
    }

    // One shared test rather than a hand-written pair per gate. The suspension
    // set by the three-warning rule lives in `status`, which neither this route
    // nor the pool query used to read — a suspended driver kept full access while
    // being emailed that they had none.
    const blockReason = driverBlockReason(driverRow);
    if (blockReason) {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: caller.userId,
          driverId: driverRow.id,
          reason: blockReason,
        },
        "authorization_failed",
      );
      res
        .status(403)
        .json({ error: blockReason, message: driverBlockMessage(blockReason) });
      return;
    }

    // Hiding the trip from their pool is presentation; this is the control. A
    // driver who lost this booking for not confirming can still POST the id.
    const [blocked] = (await hasDriverBlockTable())
      ? await db
          .select({ id: bookingDriverBlocksTable.id })
          .from(bookingDriverBlocksTable)
          .where(
            and(
              eq(bookingDriverBlocksTable.bookingId, id),
              eq(bookingDriverBlocksTable.driverId, driverRow.id),
            ),
          )
      : [];
    if (blocked) {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: caller.userId,
          driverId: driverRow.id,
          bookingId: id,
        },
        "authorization_failed",
      );
      res
        .status(403)
        .json({ error: "This trip is no longer available to you." });
      return;
    }

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id));
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    // "confirmed" with no driver = corporate booking (created confirmed, no
    // payment step) still waiting for a driver to claim it.
    if (
      !["pending", "authorized", "confirmed"].includes(booking.status) ||
      booking.driverId != null
    ) {
      res
        .status(400)
        .json({ error: "Booking is already assigned or not available" });
      return;
    }

    // Service-area check, for the same reason as the block check above: filtering
    // the pool is presentation, and booking ids are sequential. Without this a
    // driver could take a trip three metros away simply by POSTing its id.
    const coverage = await loadZoneCoverage(driverRow.id);
    if (
      coverage.enabled &&
      !isTripVisibleToDriver(await loadPickupPoint(booking.id), coverage)
    ) {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: caller.userId,
          driverId: driverRow.id,
          bookingId: id,
        },
        "authorization_failed",
      );
      res
        .status(403)
        .json({ error: "This trip is outside your assigned service area." });
      return;
    }

    const isAuthorized = booking.status === "authorized";

    if (isAuthorized && !booking.stripePaymentIntentId) {
      res
        .status(400)
        .json({ error: "Booking has no payment intent to capture" });
      return;
    }

    // ── Scheduling conflict check ────────────────────────────────────────────────
    // Re-check busy windows even though the open-pool query already filtered them.
    // This guards against race conditions where a driver accepts another trip between
    // loading the list and tapping Accept.
    const busyWindows = await getDriverBusyWindows(driverRow.id);
    if (hasConflict(booking.pickupAt, busyWindows)) {
      res.status(409).json({
        error:
          "This trip conflicts with your existing schedule. You have another booking within 1 hour of this pickup time.",
        code: "SCHEDULE_CONFLICT",
      });
      return;
    }

    // Step 1: Atomically assign the driver (optimistic locking via isNull check).
    // We do this BEFORE Stripe capture so that if capture succeeds we have a
    // consistent DB record. If capture then fails we explicitly revert.
    // Optional: driver may specify which of their vehicles they're using for this trip
    const selectedVehicleId =
      typeof req.body?.vehicleId === "number"
        ? (req.body.vehicleId as number)
        : null;

    const acceptSet: Record<string, unknown> = {
      driverId: driverRow.id,
      status: "confirmed",
    };
    if (selectedVehicleId != null)
      acceptSet.selectedVehicleId = selectedVehicleId;

    const [updated] = await db
      .update(bookingsTable)
      .set(acceptSet)
      .where(and(eq(bookingsTable.id, id), isNull(bookingsTable.driverId)))
      .returning();

    if (!updated) {
      res
        .status(409)
        .json({ error: "Booking was just taken by another driver" });
      return;
    }

    // Accepting a trip is the act the per-trip terms attach to: the confirmation
    // deadline, the arrival obligation and the late-cancellation rule all become
    // binding at this moment, which is why it is recorded per booking rather than
    // once at onboarding.
    void recordAcceptance(req, {
      documentType: "trip_terms",
      bookingId: id,
      driverId: driverRow.id,
      userId: caller.userId,
    });

    // Step 2: For authorized bookings, attempt Stripe capture now that the assignment is recorded.
    // On capture failure: revert booking to awaiting_payment + unassign driver + alert admin.
    if (isAuthorized) {
      try {
        const stripe = getStripe();
        await stripe.paymentIntents.capture(booking.stripePaymentIntentId!);
        // Capture succeeded — booking stays confirmed, continue to send emails below.
      } catch (stripeErr: any) {
        console.error(
          `[bookings] Stripe capture failed for booking #${id}:`,
          stripeErr.message,
        );
        // Revert: unassign driver and move booking back to awaiting_payment so admin is alerted.
        await db
          .update(bookingsTable)
          .set({
            driverId: null,
            status: "awaiting_payment",
            updatedAt: new Date(),
          })
          .where(eq(bookingsTable.id, id));
        console.warn(
          `[bookings] Booking #${id} reverted to awaiting_payment after capture failure`,
        );
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
          .select({
            name: usersTable.name,
            email: usersTable.email,
            phone: driversTable.phone,
            vehicleYear: driversTable.vehicleYear,
            vehicleMake: driversTable.vehicleMake,
            vehicleModel: driversTable.vehicleModel,
            vehicleColor: driversTable.vehicleColor,
          })
          .from(usersTable)
          .innerJoin(driversTable, eq(driversTable.userId, usersTable.id))
          .where(eq(usersTable.id, caller.userId));
        const bookingEmailData = {
          ...parsedUpdated,
          vehicleClass: parsedUpdated.vehicleClass ?? "business",
          passengers: parsedUpdated.passengers ?? 1,
          driverEarnings: await driverEarningsForBooking(
            parsedUpdated.id,
            parsedUpdated.fareSubtotal,
            commissionPct2,
          ),
        };
        const vehicleDescription =
          [
            driverUser?.vehicleColor,
            driverUser?.vehicleYear,
            driverUser?.vehicleMake,
            driverUser?.vehicleModel,
          ]
            .filter(Boolean)
            .join(" ") || "Luxury Vehicle";

        const emailPromises: Promise<void>[] = [
          sendDriverAcceptedAdmin(
            bookingEmailData,
            driverUser?.name ?? "Driver",
            driverUser?.email ?? "",
          ),
          sendDriverAcceptedPassenger(
            bookingEmailData,
            driverUser?.name ?? "Driver",
            driverUser?.phone ?? "",
            vehicleDescription,
          ),
        ];

        // For authorized (captured) bookings, also fire the post-payment confirmation emails
        // since they were deferred at authorization time
        if (isAuthorized) {
          const approvedDrivers = await db
            .select({ email: usersTable.email })
            .from(driversTable)
            .innerJoin(usersTable, eq(driversTable.userId, usersTable.id))
            .where(eq(driversTable.approvalStatus, "approved"));
          const driverEmails = approvedDrivers
            .map((d) => d.email)
            .filter(Boolean) as string[];
          const pushableDrivers = await db
            .select({
              pushToken: driversTable.pushToken,
              pushPlatform: driversTable.pushPlatform,
            })
            .from(driversTable)
            .where(
              and(
                eq(driversTable.status, "available"),
                eq(driversTable.complianceHold, false),
              ),
            );
          emailPromises.push(
            sendBookingConfirmationPassenger(bookingEmailData),
            sendNewBookingAdmin(bookingEmailData),
            sendNewBookingAvailableToDrivers(bookingEmailData, driverEmails),
            sendNewRideOfferPush(pushableDrivers, {
              id: bookingEmailData.id,
              pickupAddress: bookingEmailData.pickupAddress,
              driverEarnings: bookingEmailData.driverEarnings,
            }),
          );
        }

        const results = await Promise.allSettled(emailPromises);
        for (const r of results) {
          if (r.status === "rejected")
            console.error("[bookings] accept notification failed:", r.reason);
        }
      } catch (err) {
        console.error("[bookings] accept email error:", err);
      }
    })();
  },
);

// ─── Trip lifecycle endpoints (driver-only) ───────────────────────────────────

/**
 * Helper: verify the caller is the assigned driver for a booking.
 * Returns the driver DB row and booking row, or sends an error response.
 */
async function resolveAssignedDriver(
  req: import("express").Request,
  res: import("express").Response,
  bookingId: number,
): Promise<{
  booking: typeof bookingsTable.$inferSelect;
  driverRow: { id: number };
} | null> {
  const caller = req.currentUser!;
  if (caller.role !== "driver") {
    res.status(403).json({ error: "Only drivers can update trip status" });
    return null;
  }

  // ORDER BY total_rides DESC so we always get the canonical (most-active) record
  // when a driver has multiple records linked to the same userId.
  const driverRows = await db
    .select({ id: driversTable.id })
    .from(driversTable)
    .where(eq(driversTable.userId, caller.userId))
    .orderBy(desc(driversTable.totalRides));
  const driverRow = driverRows[0];

  if (!driverRow) {
    res.status(403).json({ error: "Driver profile not found" });
    return null;
  }

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId));
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
router.post(
  "/bookings/:id/trip/checklist",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const resolved = await resolveAssignedDriver(req, res, id);
    if (!resolved) return;
    const { booking } = resolved;

    if (!["confirmed", "on_way", "on_location"].includes(booking.status)) {
      res
        .status(400)
        .json({
          error: `Cannot complete checklist for booking in status: ${booking.status}`,
        });
      return;
    }

    const [updated] = await db
      .update(bookingsTable)
      .set({ checklistCompletedAt: new Date(), updatedAt: new Date() })
      .where(eq(bookingsTable.id, id))
      .returning();

    res.json({
      ok: true,
      checklistCompletedAt: updated.checklistCompletedAt?.toISOString() ?? null,
    });
  },
);

// POST /bookings/:id/trip/on-way
// Requires: caller = assigned driver, booking status = confirmed, pickup within 60 min
router.post(
  "/bookings/:id/trip/on-way",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const resolved = await resolveAssignedDriver(req, res, id);
    if (!resolved) return;
    const { booking } = resolved;

    if (booking.status !== "confirmed") {
      res
        .status(400)
        .json({ error: `Cannot mark on-way from status: ${booking.status}` });
      return;
    }

    // The window a driver may confirm in, and the deadline by which they must
    // have confirmed, are resolved together — they used to be the same 60 minutes
    // in two different files, which meant a driver could be stripped of the trip
    // a minute after becoming able to keep it. See lib/driverWindows.ts.
    const { confirmWindowMinutes } = await getDriverWindows();
    const minsUntilPickup =
      (new Date(booking.pickupAt).getTime() - Date.now()) / 60_000;
    if (minsUntilPickup > confirmWindowMinutes) {
      res.status(400).json({
        error: `On the Way can only be activated within ${confirmWindowMinutes} minutes of pickup`,
        minsUntilPickup: Math.round(minsUntilPickup),
        confirmWindowMinutes,
      });
      return;
    }

    const [updated] = await db
      .update(bookingsTable)
      .set({ status: "on_way", updatedAt: new Date() })
      .where(
        and(eq(bookingsTable.id, id), eq(bookingsTable.status, "confirmed")),
      )
      .returning();

    if (!updated) {
      res
        .status(409)
        .json({
          error:
            "Booking status has already changed — please refresh and try again.",
        });
      return;
    }

    res.json(parseBooking(updated));

    // Fire-and-forget: notify passenger via email + SMS
    (async () => {
      try {
        const b = parseBooking(booking);
        const [driverRow] = await db
          .select()
          .from(driversTable)
          .where(eq(driversTable.id, booking.driverId!));
        const vehicleDesc = driverRow
          ? `${driverRow.vehicleYear ?? ""} ${driverRow.vehicleMake ?? ""} ${driverRow.vehicleModel ?? ""}`.trim()
          : (booking.vehicleClass ?? "vehicle");
        await Promise.allSettled([
          sendDriverOnWay({
            ...b,
            vehicleClass: b.vehicleClass ?? "business",
            passengers: b.passengers ?? 1,
          }),
          sendDriverOnWaySms(
            booking.passengerPhone,
            driverRow?.name ?? "Your chauffeur",
            vehicleDesc,
          ),
        ]);
      } catch (err) {
        console.error("[bookings] on-way notification error:", err);
      }
    })();
  },
);

// POST /bookings/:id/trip/on-location
// Requires: caller = assigned driver, booking status = on_way
router.post(
  "/bookings/:id/trip/on-location",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const resolved = await resolveAssignedDriver(req, res, id);
    if (!resolved) return;
    const { booking } = resolved;

    if (booking.status !== "on_way") {
      res
        .status(400)
        .json({ error: `Cannot mark arrived from status: ${booking.status}` });
      return;
    }

    const [updated] = await db
      .update(bookingsTable)
      .set({ status: "on_location", updatedAt: new Date() })
      .where(and(eq(bookingsTable.id, id), eq(bookingsTable.status, "on_way")))
      .returning();

    if (!updated) {
      res
        .status(409)
        .json({
          error:
            "Booking status has already changed — please refresh and try again.",
        });
      return;
    }

    res.json(parseBooking(updated));

    // Fire-and-forget: notify passenger via email + SMS
    (async () => {
      try {
        const b = parseBooking(booking);
        const [driverRow] = await db
          .select()
          .from(driversTable)
          .where(eq(driversTable.id, booking.driverId!));
        await Promise.allSettled([
          sendDriverArrived({
            ...b,
            vehicleClass: b.vehicleClass ?? "business",
            passengers: b.passengers ?? 1,
          }),
          sendDriverArrivedSms(
            booking.passengerPhone,
            driverRow?.name ?? "Your chauffeur",
          ),
        ]);
      } catch (err) {
        console.error("[bookings] on-location notification error:", err);
      }
    })();
  },
);

// POST /bookings/:id/trip/start
// Requires: caller = assigned driver, booking status = on_location
router.post(
  "/bookings/:id/trip/start",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const resolved = await resolveAssignedDriver(req, res, id);
    if (!resolved) return;
    const { booking } = resolved;

    if (booking.status !== "on_location") {
      res
        .status(400)
        .json({ error: `Cannot start trip from status: ${booking.status}` });
      return;
    }

    // For hourly charters, freeze the rate/limit defaults onto the booking now so
    // the check-reservation-status cron has stable values to compute overage from,
    // even if pricing defaults change later.
    const hourlySetFields =
      booking.charterMode === "hourly"
        ? {
            hourlyRate:
              booking.hourlyRate ??
              String(HOURLY_RATES[booking.vehicleClass] ?? 95),
            maxMilesPerHour: booking.maxMilesPerHour ?? 30,
            extraMileRate:
              booking.extraMileRate ??
              String(DEFAULT_RATE_PER_MILE[booking.vehicleClass] ?? 3.5),
          }
        : {};

    const [updated] = await db
      .update(bookingsTable)
      .set({
        status: "in_progress",
        tripStartedAt: new Date(),
        updatedAt: new Date(),
        ...hourlySetFields,
      })
      .where(
        and(eq(bookingsTable.id, id), eq(bookingsTable.status, "on_location")),
      )
      .returning();

    if (!updated) {
      res
        .status(409)
        .json({
          error:
            "Booking status has already changed — please refresh and try again.",
        });
      return;
    }

    res.json(parseBooking(updated));
  },
);

// POST /bookings/:id/trip/complete
// Requires: caller = assigned driver, booking status = in_progress
router.post(
  "/bookings/:id/trip/complete",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const resolved = await resolveAssignedDriver(req, res, id);
    if (!resolved) return;
    const { booking } = resolved;

    if (booking.status !== "in_progress") {
      res
        .status(400)
        .json({ error: `Cannot complete trip from status: ${booking.status}` });
      return;
    }

    // Hourly overage, computed here rather than by the cron that was planned and
    // never written. trip/start froze hourly_rate onto the row for exactly this.
    // The clock is the passenger's actual pickup (trip_started_at), so a driver
    // waiting at the kerb does not burn the block.
    //
    // Whole hours, never pro-rata. 21 minutes over costs a full hour and so does
    // 59 — that is the rule the customer is shown at booking and on the receipt.
    // The check-reservation-status edge function used to write a *pro-rata*
    // estimate onto extra_charge every minute a charter ran long, and the line
    // below preferred any existing value, so the estimate always won and the
    // customer was billed $32.16 where the quoted rule said $75.00.
    const endedAt = new Date();
    const overage = computeHourlyOverage({
      startedAt: booking.tripStartedAt,
      endedAt,
      contractedHours: booking.charterHours,
      hourlyRate:
        booking.hourlyRate != null
          ? parseFloat(String(booking.hourlyRate))
          : null,
    });

    // Extra time is taxed and carries the card fee, exactly like the fare. Only
    // `charge.fare` earns the chauffeur commission — they are not paid a share of
    // Florida's sales tax.
    const rates = await loadChargeRates();
    const charge = computePostTripCharge({
      fare: overage.extraCharge,
      taxRate: rates.taxRate,
      cardProcessingFeeRate: rates.cardProcessingFeeRate,
    });

    // A figure an administrator entered by hand from the booking screen is a
    // negotiated adjustment and still wins — but only when this booking has no
    // computed overage of its own, so a stale cron estimate can no longer shadow
    // the real one.
    const manualExtra = parseFloat(String(booking.extraCharge ?? "0")) || 0;
    const useManual = charge.total <= 0 && manualExtra > 0;
    const extraCharge = useManual ? manualExtra : charge.total;
    const totalPrice =
      Math.round(
        (parseFloat(String(booking.priceQuoted)) + extraCharge) * 100,
      ) / 100;

    const [updated] = await db
      .update(bookingsTable)
      .set({
        status: "completed",
        tripEndedAt: endedAt,
        extraCharge: String(extraCharge),
        totalPrice: String(totalPrice),
        updatedAt: endedAt,
      })
      .where(
        and(eq(bookingsTable.id, id), eq(bookingsTable.status, "in_progress")),
      )
      .returning();

    if (!updated) {
      res
        .status(409)
        .json({
          error:
            "Booking status has already changed — please refresh and try again.",
        });
      return;
    }

    // Actually take the money. The charge was computed, stored and shown on the
    // receipt from the day the timer shipped, and never once presented to a card:
    // "extra time $32.16" was a label on a screen, not a transaction. Off-session
    // against the card the passenger already saved for this trip, and best-effort
    // — a completed trip must not be blocked by a declined incremental charge,
    // which dispatch can chase from the booking screen instead.
    let overagePaymentIntentId: string | null = null;
    if (!useManual && charge.total > 0) {
      overagePaymentIntentId = await chargeExtraTime(
        updated,
        charge.total,
        req.log,
      );
    }

    res.json({
      ...parseBooking(updated),
      overage,
      overageCharge: charge,
      overagePaymentIntentId,
    });

    // overage_* and the breakdown columns are not on the drizzle schema, so they
    // are written separately and best-effort — see the note in
    // lib/db/src/schema/bookings.ts about why a new column must never be able to
    // break the table's other queries.
    if (
      !useManual &&
      (overage.reason === "overage" || overage.overtimeMinutes > 0)
    ) {
      void saveOverageBreakdown(
        id,
        {
          overageFare: charge.fare,
          overageTax: charge.taxAmount,
          overageCardFee: charge.cardProcessingFee,
          overageMinutes: overage.overtimeMinutes,
          paymentIntentId: overagePaymentIntentId,
        },
        req.log,
      ).catch((err) =>
        console.error("[bookings] overage breakdown save failed:", err),
      );
    }

    // Increment driver's completed ride count (fire-and-forget)
    if (updated.driverId) {
      db.update(driversTable)
        .set({ totalRides: sql`${driversTable.totalRides} + 1` })
        .where(eq(driversTable.id, updated.driverId))
        .catch((err) =>
          console.error("[bookings] failed to increment totalRides:", err),
        );
    }

    // Fire-and-forget: send trip completion email to passenger
    (async () => {
      try {
        await sendTripCompletionEmail(
          {
            id: updated.id,
            passengerName: updated.passengerName,
            passengerEmail: updated.passengerEmail,
            pickupAddress: updated.pickupAddress,
            dropoffAddress: updated.dropoffAddress,
            pickupAt: updated.pickupAt.toISOString(),
            vehicleClass: updated.vehicleClass ?? "standard",
            passengers: updated.passengers ?? 1,
            priceQuoted: parseFloat(String(updated.priceQuoted)),
          },
          updated.tipAmount != null
            ? parseFloat(String(updated.tipAmount))
            : null,
          extraCharge > 0 ? extraCharge : null,
        );
      } catch (err) {
        console.error("[bookings] trip completion email error:", err);
      }
    })();

    if (updated.userId) {
      maybeRewardReferrerForCompletedRide(updated.userId).catch((err) =>
        console.error("[bookings] referral reward error:", err),
      );
    }
  },
);

/**
 * POST /bookings/:id/collect-extra-time — take payment for extra time that was
 * never collected.
 *
 * Two things need this. Trip completion charges the card off-session and does
 * not fail the chauffeur's "end trip" tap if the card declines, which leaves an
 * amount owed and, until now, no way at all to chase it. And every charter
 * completed before this shipped has an extra_charge that was computed, shown on
 * the receipt, and never presented to a card — booking #13 among them.
 *
 * The amount is RECOMPUTED here from the booking's own frozen inputs
 * (trip_started_at, trip_ended_at, charter_hours, hourly_rate) rather than read
 * from extra_charge, because on exactly those older rows extra_charge holds the
 * pro-rata figure the edge function used to write: $32.16 where the published
 * rule, the booking form and the passenger's own receipt all say the next whole
 * hour. Recomputing is what makes the stored row correct everywhere at once —
 * receipt, admin screen, chauffeur's earnings and the revenue report all read
 * these columns.
 *
 * Idempotent two ways: it refuses once a PaymentIntent is recorded, and the
 * Stripe call carries a fixed idempotency key per booking.
 */
router.post(
  "/bookings/:id/collect-extra-time",
  requireAdmin,
  async (req, res): Promise<void> => {
    // String(...) because Express 5 types params as string | string[]. Most of
    // this file predates that and carries the resulting type error; no reason to
    // add another.
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id));
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    if (booking.status !== "completed") {
      res
        .status(400)
        .json({
          error: `Extra time can only be collected on a completed trip (this one is ${booking.status}).`,
        });
      return;
    }

    const receipts = await loadBookingReceipts([id]);
    const existing = receipts.get(id);
    if (existing?.extraChargePaymentIntentId) {
      res.status(409).json({
        error: "The extra time on this booking has already been charged.",
        paymentIntentId: existing.extraChargePaymentIntentId,
      });
      return;
    }

    const overage = computeHourlyOverage({
      startedAt: booking.tripStartedAt,
      endedAt: booking.tripEndedAt,
      contractedHours: booking.charterHours,
      hourlyRate:
        booking.hourlyRate != null
          ? parseFloat(String(booking.hourlyRate))
          : null,
    });

    const rates = await loadChargeRates();
    const charge = computePostTripCharge({
      fare: overage.extraCharge,
      taxRate: rates.taxRate,
      cardProcessingFeeRate: rates.cardProcessingFeeRate,
    });

    if (charge.total <= 0) {
      res.status(400).json({
        error:
          overage.reason === "within_grace"
            ? `This charter ran ${overage.overtimeMinutes} minutes over, inside the ${OVERAGE_GRACE_MINUTES}-minute allowance. There is nothing to charge.`
            : "This charter has no billable extra time.",
        overage,
      });
      return;
    }

    const paymentIntentId = await chargeExtraTime(
      booking,
      charge.total,
      req.log,
    );
    if (!paymentIntentId) {
      res.status(402).json({
        error:
          "The card on file could not be charged. Check the passenger's saved payment method in Stripe, then try again.",
        amount: charge.total,
      });
      return;
    }

    // Only now is the row rewritten. A failed charge must not leave the booking
    // claiming a different amount than the one the customer was originally shown.
    const totalPrice =
      Math.round(
        (parseFloat(String(booking.priceQuoted)) + charge.total) * 100,
      ) / 100;
    await db
      .update(bookingsTable)
      .set({
        extraCharge: String(charge.total),
        totalPrice: String(totalPrice),
        updatedAt: new Date(),
      })
      .where(eq(bookingsTable.id, id));

    await saveOverageBreakdown(
      id,
      {
        overageFare: charge.fare,
        overageTax: charge.taxAmount,
        overageCardFee: charge.cardProcessingFee,
        overageMinutes: overage.overtimeMinutes,
        paymentIntentId,
      },
      req.log,
    );

    req.log?.warn(
      { bookingId: id, amount: charge.total, paymentIntentId },
      "extra_time_collected_manually",
    );

    res.json({ ok: true, paymentIntentId, charge, overage, totalPrice });

    // Tell the passenger. The completion email went out when the chauffeur ended
    // the trip, before this money was known to be collectable — and on older
    // bookings it is being taken days afterwards. Fire-and-forget: the charge has
    // already succeeded and a failed email must not suggest otherwise.
    void sendExtraTimeChargedEmail({
      bookingId: id,
      passengerName: booking.passengerName,
      passengerEmail: booking.passengerEmail,
      overtimeMinutes: overage.overtimeMinutes,
      fare: charge.fare,
      taxAmount: charge.taxAmount,
      cardProcessingFee: charge.cardProcessingFee,
      total: charge.total,
    }).catch((err) =>
      console.error("[bookings] extra-time receipt email failed:", err),
    );
  },
);

// Admin: unassign driver from a booking (puts it back in the open pool)
router.post(
  "/bookings/:id/unassign",
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const [existing] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id));
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
        await sendDriverUnassignedAdmin(
          id,
          driverUser?.name ?? `Driver #${prevDriverId}`,
          existing.passengerName,
        );
      } catch (err) {
        console.error("[bookings] unassign email error:", err);
      }
    })();
  },
);

// ─── Cancel preview — returns fee info without cancelling ─────────────────────

router.get(
  "/bookings/:id/cancel-preview",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (!id) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id));
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    const caller = req.currentUser!;
    if (caller.role !== "admin" && booking.userId !== caller.userId) {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const priceQuoted = parseFloat(String(booking.priceQuoted));
    const policy = getCancellationPolicy(
      booking.pickupAt,
      priceQuoted,
      booking.status,
    );
    res.json(policy);
  },
);

// ─── Cancel booking ───────────────────────────────────────────────────────────

router.delete("/bookings/:id", requireAuth, async (req, res): Promise<void> => {
  const params = CancelBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const caller = req.currentUser!;

  // Passengers/corporate can only cancel their own bookings in cancellable statuses
  if (caller.role !== "admin") {
    if (existing.userId !== caller.userId) {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
      res.status(403).json({ error: "Access denied" });
      return;
    }
    if (["completed", "cancelled", "in_progress"].includes(existing.status)) {
      res.status(400).json({ error: "This booking cannot be cancelled." });
      return;
    }
  }

  const priceQuoted = parseFloat(String(existing.priceQuoted));
  const policy = getCancellationPolicy(
    existing.pickupAt,
    priceQuoted,
    existing.status,
  );

  // Conditioned on status != cancelled so two overlapping cancel requests (a
  // double-click, a retried request) can't both see a row to act on — only
  // the one that actually flips the status fires the Stripe side effect
  // below. Without this, the second request would re-derive the same policy
  // against an "already cancelled" row (netRefund 0, harmless), but a
  // narrower race where both reads land before either write completes could
  // otherwise trigger two refunds for one cancellation.
  const [cancelled] = await db
    .update(bookingsTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(bookingsTable.id, params.data.id), ne(bookingsTable.status, "cancelled")))
    .returning({ id: bookingsTable.id });

  res.json({
    success: true,
    feePercent: policy.feePercent,
    feeAmount: policy.feeAmount,
    netRefund: policy.netRefund,
  });

  // Fire-and-forget: settle the Stripe side of the cancellation.
  //
  // This used to only run for awaiting_payment/authorized — i.e. before the
  // card was actually charged. But the payment intent is created with
  // capture_method: "automatic" (payments.ts), so a booking is captured and
  // moved out of those two statuses within moments of payment succeeding.
  // Every cancellation after that point — which in practice is nearly all of
  // them — updated the booking, emailed the passenger a promise of a refund
  // per the 12h/2h policy, and never actually called Stripe. The refund the
  // email promised never happened unless an admin noticed and did it by hand
  // in the Stripe dashboard.
  if (cancelled && existing.stripePaymentIntentId) {
    (async () => {
      try {
        const stripe = getStripe();
        const pi = await stripe.paymentIntents.retrieve(
          existing.stripePaymentIntentId!,
        );
        if (
          [
            "requires_payment_method",
            "requires_confirmation",
            "requires_action",
            "requires_capture",
          ].includes(pi.status)
        ) {
          // Never charged (or only a hold placed) — cancelling the PI is the
          // whole story, there is nothing to refund.
          await stripe.paymentIntents.cancel(existing.stripePaymentIntentId!);
          console.log(
            `[bookings] PI cancelled on booking cancel for booking #${existing.id} (PI status was: ${pi.status})`,
          );
        } else if (pi.status === "succeeded") {
          // Charged. Refund exactly what the cancellation policy says is
          // owed — full refund at 12h+, 75% at 2-12h (25% fee retained),
          // nothing under 2h/no-show. Not a flat full refund: that would
          // hand back the cancellation fee the passenger was told about.
          const refundCents = Math.round(policy.netRefund * 100);
          if (refundCents > 0) {
            await stripe.refunds.create({
              payment_intent: existing.stripePaymentIntentId!,
              amount: refundCents,
            });
            console.log(
              `[bookings] Refunded $${policy.netRefund.toFixed(2)} (tier: ${policy.tier}) for booking #${existing.id}`,
            );
          } else {
            console.log(
              `[bookings] No refund owed (tier: ${policy.tier}) for booking #${existing.id} — cancellation fee covers the full charge`,
            );
          }
        } else {
          console.log(
            `[bookings] PI in unvoidable status '${pi.status}' for booking #${existing.id} — no action taken`,
          );
        }
      } catch (err) {
        console.error(
          "[bookings] Stripe PI cancel/refund failed on booking cancel:",
          err,
        );
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

router.post(
  "/bookings/:id/rate",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const { rating, comment } = req.body as {
      rating?: number;
      comment?: string;
    };
    if (!rating || rating < 1 || rating > 5) {
      res.status(400).json({ error: "Rating must be between 1 and 5" });
      return;
    }

    const caller = req.currentUser!;

    const [booking] = await db
      .select({
        id: bookingsTable.id,
        status: bookingsTable.status,
        userId: bookingsTable.userId,
        driverId: bookingsTable.driverId,
      })
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id));

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    // Only the passenger who booked this ride can rate it
    if (booking.userId !== caller.userId) {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
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
      .values({
        bookingId: id,
        driverId: booking.driverId,
        userId: caller.userId,
        rating,
        comment: comment ?? null,
      })
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
          return db
            .update(driversTable)
            .set({ rating: row.avg })
            .where(eq(driversTable.id, driverId));
        }
        return undefined;
      })
      .catch((err) =>
        console.error("[bookings] failed to update driver rating:", err),
      );
  },
);

export default router;
