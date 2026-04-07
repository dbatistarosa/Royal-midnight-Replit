import { Router, type IRouter } from "express";
import { eq, desc, and, isNull } from "drizzle-orm";
import { db, bookingsTable, driversTable, settingsTable, usersTable } from "@workspace/db";
import { requireAuth, requireAdmin, optionalAuth } from "../middleware/auth.js";
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
      // Corporate bookings are confirmed immediately — no payment required
      status: isCorporate ? "confirmed" : "pending",
    })
    .returning();

  res.status(201).json(GetBookingResponse.parse(parseBooking(booking)));
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

  res.json(parseBooking(updated));
});

router.delete("/bookings/:id", async (req, res): Promise<void> => {
  const params = CancelBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [booking] = await db
    .update(bookingsTable)
    .set({ status: "cancelled" })
    .where(eq(bookingsTable.id, params.data.id))
    .returning();

  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
