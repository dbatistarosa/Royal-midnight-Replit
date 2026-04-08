import { Router, type IRouter } from "express";
import { eq, desc, and, isNull, ne, sql } from "drizzle-orm";
import { db, bookingsTable, driversTable, settingsTable, usersTable, promoCodesTable } from "@workspace/db";
import { requireAuth, requireAdmin, optionalAuth } from "../middleware/auth.js";
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

function parseBooking(b: typeof bookingsTable.$inferSelect) {
  return {
    ...b,
    priceQuoted: parseFloat(b.priceQuoted ?? "0"),
    discountAmount: b.discountAmount != null ? parseFloat(b.discountAmount) : null,
    pickupAt: b.pickupAt.toISOString(),
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
    } else if (requestedStatus === "pending") {
      // Requesting the open/unassigned pool — limit to bookings with no driver assigned
      conditions.push(isNull(bookingsTable.driverId));
    } else {
      // Default: own assigned bookings only
      conditions.push(eq(bookingsTable.driverId, driverRow.id));
    }
  }

  // Passengers and corporate accounts can only see their own bookings
  if (caller.role === "passenger" || caller.role === "corporate") {
    const requestedUserId = parsed.data.userId;
    if (requestedUserId != null && requestedUserId !== caller.userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    if (requestedUserId == null) {
      conditions.push(eq(bookingsTable.userId, caller.userId));
    }
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
    res.json(parsed2.map(b => toDriverView(b, commissionPct)));
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

  // Public view: only status, identity, and routing — no fare or full PII
  res.json({
    id: booking.id,
    status: booking.status,
    passengerName: booking.passengerName,
    pickupAddress: booking.pickupAddress,
    dropoffAddress: booking.dropoffAddress,
    pickupAt: booking.pickupAt.toISOString(),
    driverId: booking.driverId,
    vehicleClass: booking.vehicleClass,
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
  if ((caller.role === "passenger" || caller.role === "corporate") && booking.userId !== caller.userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  res.json(parseBooking(booking));
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

  if (booking.status !== "pending" || booking.driverId != null) {
    res.status(400).json({ error: "Booking is already assigned or not available" });
    return;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ driverId: driverRow.id, status: "confirmed" })
    .where(and(eq(bookingsTable.id, id), isNull(bookingsTable.driverId)))
    .returning();

  if (!updated) {
    res.status(409).json({ error: "Booking was just taken by another driver" });
    return;
  }

  const commissionPct2 = await getCommissionPct();
  const parsedUpdated = parseBooking(updated);
  res.json(parsedUpdated);

  // Fire-and-forget: notify admin and passenger that driver accepted
  (async () => {
    try {
      const [driverUser] = await db
        .select({ name: usersTable.name, email: usersTable.email, phone: driversTable.phone, vehicleYear: driversTable.vehicleYear, vehicleMake: driversTable.vehicleMake, vehicleModel: driversTable.vehicleModel, vehicleColor: driversTable.vehicleColor })
        .from(usersTable)
        .innerJoin(driversTable, eq(driversTable.userId, usersTable.id))
        .where(eq(usersTable.id, caller.userId));
      const bookingEmailData = { ...parsedUpdated, vehicleClass: parsedUpdated.vehicleClass ?? "business", passengers: parsedUpdated.passengers ?? 1, driverEarnings: Math.round(parsedUpdated.priceQuoted * commissionPct2 * 100) / 100 };
      const vehicleDescription = [driverUser?.vehicleColor, driverUser?.vehicleYear, driverUser?.vehicleMake, driverUser?.vehicleModel].filter(Boolean).join(" ") || "Luxury Vehicle";
      await Promise.all([
        sendDriverAcceptedAdmin(bookingEmailData, driverUser?.name ?? "Driver", driverUser?.email ?? ""),
        sendDriverAcceptedPassenger(bookingEmailData, driverUser?.name ?? "Driver", driverUser?.phone ?? "", vehicleDescription),
      ]);
    } catch (err) {
      console.error("[bookings] accept email error:", err);
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

export default router;
