import { Router, type IRouter } from "express";
import Stripe from "stripe";
import { eq, desc, and, or, isNull, ne, sql } from "drizzle-orm";
import { db, bookingsTable, driversTable, settingsTable, usersTable, promoCodesTable, reviewsTable } from "@workspace/db";
import { requireAuth, requireAdmin, optionalAuth } from "../middleware/auth.js";
import { getRouteEstimate, DEFAULT_DURATION_MINUTES } from "../lib/maps.js";
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
} from "../lib/mailer.js";
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

function parseBooking(b: typeof bookingsTable.$inferSelect) {
  return {
    ...b,
    priceQuoted: parseFloat(b.priceQuoted ?? "0"),
    discountAmount: b.discountAmount != null ? parseFloat(b.discountAmount) : null,
    tipAmount: b.tipAmount != null ? parseFloat(b.tipAmount) : null,
    pickupAt: b.pickupAt.toISOString(),
    authorizedAt: b.authorizedAt != null ? b.authorizedAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

// ─── Cancellation policy ─────────────────────────────────────────────────────

type CancellationTier = "free" | "partial_25" | "partial_50" | "non_cancellable";

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

  if (hoursUntilPickup >= 24) {
    return {
      canCancel: true, tier: "free",
      feePercent: 0, feeAmount: 0, netRefund: priceQuoted,
      hoursUntilPickup,
      message: "Cancellations made 24 hours or more before pickup are fully refunded — no fee applies.",
      priceQuoted,
    };
  }

  if (hoursUntilPickup >= 12) {
    const feeAmount = Math.round(priceQuoted * 0.25 * 100) / 100;
    return {
      canCancel: true, tier: "partial_25",
      feePercent: 25, feeAmount, netRefund: Math.round((priceQuoted - feeAmount) * 100) / 100,
      hoursUntilPickup,
      message: "Cancellations made 12–24 hours before pickup incur a 25% cancellation fee.",
      priceQuoted,
    };
  }

  const feeAmount = Math.round(priceQuoted * 0.50 * 100) / 100;
  return {
    canCancel: true, tier: "partial_50",
    feePercent: 50, feeAmount, netRefund: Math.round((priceQuoted - feeAmount) * 100) / 100,
    hoursUntilPickup,
    message: "Cancellations made less than 12 hours before pickup incur a 50% cancellation fee.",
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

function toDriverView<T extends { priceQuoted: number }>(
  booking: T,
  commissionPct: number
): Omit<T, "priceQuoted"> & { driverEarnings: number } {
  const { priceQuoted, ...rest } = booking;
  return {
    ...rest,
    driverEarnings: Math.round(priceQuoted * commissionPct * 100) / 100,
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
  if (parsed.data.status) conditions.push(eq(bookingsTable.status, parsed.data.status));
  if (parsed.data.driverId != null) conditions.push(eq(bookingsTable.driverId, parsed.data.driverId));
  if (parsed.data.userId != null) conditions.push(eq(bookingsTable.userId, parsed.data.userId));

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
    const [driverRow] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, caller.userId));
    if (!driverRow) {
      res.json([]);
      return;
    }

    const requestedDriverId = parsed.data.driverId;
    const requestedStatus = parsed.data.status;

    if (requestedDriverId != null) {
      // Driver may only query their own driverId
      if (requestedDriverId !== driverRow.id) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      // Already in conditions via parsed.data.driverId above — no extra condition needed
    } else if (requestedStatus === "pending" || requestedStatus === "authorized") {
      // Requesting the open/unassigned pool — includes both pending and authorized bookings.
      // Pre-fetch this driver's busy windows so conflicting trips can be hidden below.
      conditions.push(isNull(bookingsTable.driverId));
      isDriverOpenPoolQuery = true;
      driverBusyWindows = await getDriverBusyWindows(driverRow.id);
    } else {
      // Default: own assigned bookings only
      conditions.push(eq(bookingsTable.driverId, driverRow.id));
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
    // A trip conflicts if its pickupAt falls within any busy window:
    //   [existingPickup - 1h,  existingPickup + estimatedDuration + 1h]
    if (isDriverOpenPoolQuery && driverBusyWindows.length > 0) {
      driverBookings = parsed2.filter(b => !hasConflict(new Date(b.pickupAt), driverBusyWindows));
    }

    res.json(driverBookings.map(b => toDriverView(b, commissionPct)));
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
    // Force userId to caller's own id (unless admin is booking on behalf)
    if (caller.role === "corporate") {
      parsed.data.userId = caller.userId;
    }
  }

  const [booking] = await db
    .insert(bookingsTable)
    .values({
      ...parsed.data,
      pickupAt: new Date(parsed.data.pickupAt),
      priceQuoted: String(parsed.data.priceQuoted),
      discountAmount: parsed.data.discountAmount != null ? String(parsed.data.discountAmount) : null,
      paymentType: parsed.data.paymentType ?? "standard",
      // Corporate bookings are confirmed immediately — all others (including admin-manual) await payment
      status: isCorporate ? "confirmed" : "awaiting_payment",
    })
    .returning();

  res.status(201).json(GetBookingResponse.parse(parseBooking(booking)));

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

  // If a promo code was used, increment its usedCount (non-blocking)
  if (booking.promoCode) {
    db.update(promoCodesTable)
      .set({ usedCount: sql`${promoCodesTable.usedCount} + 1` })
      .where(eq(promoCodesTable.code, booking.promoCode))
      .catch(err => console.error("[bookings] promoCode usedCount increment failed:", err));
  }

  // Corporate bookings: fire emails immediately since no payment step
  if (isCorporate) {
    (async () => {
      try {
        const parsed2 = parseBooking(booking);
        const commissionPct = await getCommissionPct();
        const driverEarnings = Math.round(parsed2.priceQuoted * commissionPct * 100) / 100;
        const emailData = {
          ...parsed2,
          vehicleClass: parsed2.vehicleClass ?? "business",
          passengers: parsed2.passengers ?? 1,
          driverEarnings,
        };
        await sendBookingConfirmationPassenger(emailData);
        await sendNewBookingAdmin(emailData);
        const approvedDrivers = await db
          .select({ email: usersTable.email })
          .from(driversTable)
          .innerJoin(usersTable, eq(driversTable.userId, usersTable.id))
          .where(eq(driversTable.approvalStatus, "approved"));
        const driverEmails = approvedDrivers.map(d => d.email).filter(Boolean) as string[];
        await sendNewBookingAvailableToDrivers(emailData, driverEmails);
      } catch (err) {
        console.error("[bookings] corporate post-create email error:", err);
      }
    })();
  }
});

// Public tracking endpoint — returns only non-sensitive status fields (no fare/PII)
router.get("/bookings/:id/track", async (req, res): Promise<void> => {
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

  // Public view: status, identity, routing, and fare for receipt display.
  // passengerEmail is masked to first char + domain (e.g. a***@example.com) to
  // avoid exposing full PII on an unauthenticated endpoint while still
  // allowing the confirmation page to show where the receipt was sent.
  const maskedEmail = booking.passengerEmail
    ? booking.passengerEmail.replace(/^(.).+(@.+)$/, "$1***$2")
    : null;

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
    priceQuoted: booking.priceQuoted ? parseFloat(booking.priceQuoted) : null,
    discountAmount: booking.discountAmount ? parseFloat(booking.discountAmount) : null,
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

  res.json(parseBooking(booking));
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
    }
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

  const [driverRow] = await db
    .select({ id: driversTable.id, approvalStatus: driversTable.approvalStatus })
    .from(driversTable)
    .where(eq(driversTable.userId, caller.userId));

  if (!driverRow || driverRow.approvalStatus !== "approved") {
    res.status(403).json({ error: "Driver not approved" });
    return;
  }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  if (!["pending", "authorized"].includes(booking.status) || booking.driverId != null) {
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
  const [updated] = await db
    .update(bookingsTable)
    .set({ driverId: driverRow.id, status: "confirmed" })
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
      const bookingEmailData = { ...parsedUpdated, vehicleClass: parsedUpdated.vehicleClass ?? "business", passengers: parsedUpdated.passengers ?? 1, driverEarnings: Math.round(parsedUpdated.priceQuoted * commissionPct2 * 100) / 100 };
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
        emailPromises.push(
          sendBookingConfirmationPassenger(bookingEmailData),
          sendNewBookingAdmin(bookingEmailData),
          sendNewBookingAvailableToDrivers(bookingEmailData, driverEmails),
        );
      }

      await Promise.all(emailPromises);
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

  const [driverRow] = await db
    .select({ id: driversTable.id, userId: driversTable.userId })
    .from(driversTable)
    .where(eq(driversTable.userId, caller.userId));

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

  // Fire-and-forget: notify passenger
  (async () => {
    try {
      const b = parseBooking(booking);
      await sendDriverOnWay({ ...b, vehicleClass: b.vehicleClass ?? "business", passengers: b.passengers ?? 1 });
    } catch (err) { console.error("[bookings] on-way email error:", err); }
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

  // Fire-and-forget: notify passenger
  (async () => {
    try {
      const b = parseBooking(booking);
      await sendDriverArrived({ ...b, vehicleClass: b.vehicleClass ?? "business", passengers: b.passengers ?? 1 });
    } catch (err) { console.error("[bookings] on-location email error:", err); }
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

  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "in_progress", updatedAt: new Date() })
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

  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "completed", updatedAt: new Date() })
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.status, "in_progress")))
    .returning();

  if (!updated) {
    res.status(409).json({ error: "Booking status has already changed — please refresh and try again." });
    return;
  }

  res.json(parseBooking(updated));

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
      }, updated.tipAmount != null ? parseFloat(String(updated.tipAmount)) : null);
    } catch (err) {
      console.error("[bookings] trip completion email error:", err);
    }
  })();
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
});

export default router;
