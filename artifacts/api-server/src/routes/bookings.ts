import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, bookingsTable, driversTable, settingsTable } from "@workspace/db";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
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

  // Non-admin drivers can only see their own bookings
  if (caller.role === "driver") {
    const [driverRow] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, caller.userId));
    if (!driverRow) {
      res.json([]);
      return;
    }
    // Allow driverId filter if it matches own record; otherwise force own
    const requestedDriverId = parsed.data.driverId;
    if (requestedDriverId != null && requestedDriverId !== driverRow.id) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    if (requestedDriverId == null) {
      conditions.push(eq(bookingsTable.driverId, driverRow.id));
    }
  }

  // Passengers can only see their own bookings
  if (caller.role === "passenger") {
    const requestedUserId = parsed.data.userId;
    if (requestedUserId != null && requestedUserId !== caller.userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    if (requestedUserId == null) {
      conditions.push(eq(bookingsTable.userId, caller.userId));
    }
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

  // Return data as-is for admin/passenger — skip Zod re-validation to avoid
  // enum mismatches from legacy seeded rows with old vehicleClass values
  res.json(parsed2);
});

router.post("/bookings", async (req, res): Promise<void> => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [booking] = await db
    .insert(bookingsTable)
    .values({
      ...parsed.data,
      pickupAt: new Date(parsed.data.pickupAt),
      priceQuoted: String(parsed.data.priceQuoted),
      discountAmount: parsed.data.discountAmount != null ? String(parsed.data.discountAmount) : null,
    })
    .returning();

  res.status(201).json(GetBookingResponse.parse(parseBooking(booking)));
});

router.get("/bookings/:id", optionalAuth, async (req, res): Promise<void> => {
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

  const caller = req.currentUser;

  // Authenticated driver: can only access their own assigned bookings; receive driver-view (no priceQuoted)
  if (caller?.role === "driver") {
    const [driverRow] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, caller.userId));
    if (!driverRow || booking.driverId !== driverRow.id) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const commissionPct = await getCommissionPct();
    res.json(toDriverView(parseBooking(booking), commissionPct));
    return;
  }

  // Authenticated passenger: can only access their own bookings
  if (caller?.role === "passenger" && booking.userId !== caller.userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  // Unauthenticated (public track page) and admin: return full booking data
  res.json(parseBooking(booking));
});

router.patch("/bookings/:id", async (req, res): Promise<void> => {
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
