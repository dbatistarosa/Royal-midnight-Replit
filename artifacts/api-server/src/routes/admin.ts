import { Router, type IRouter } from "express";
import { sql, desc, eq } from "drizzle-orm";
import { db, bookingsTable, driversTable, vehiclesTable, usersTable, supportTicketsTable } from "@workspace/db";
import {
  GetAdminStatsResponse,
  GetRecentBookingsQueryParams,
  GetRecentBookingsResponse,
  GetRevenueStatsResponse,
  GetDispatchBoardResponse,
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

function parseDriver(d: typeof driversTable.$inferSelect) {
  return {
    ...d,
    rating: d.rating != null ? parseFloat(d.rating) : null,
    createdAt: d.createdAt.toISOString(),
    locationUpdatedAt: d.locationUpdatedAt ? d.locationUpdatedAt.toISOString() : null,
  };
}

router.get("/admin/stats", async (_req, res): Promise<void> => {
  const [bookingStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where status in ('pending', 'confirmed', 'in_progress'))::int`,
      completedToday: sql<number>`count(*) filter (where status = 'completed' and pickup_at::date = current_date)::int`,
      totalRevenue: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed'), 0)::float`,
      revenueThisMonth: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed' and date_trunc('month', created_at) = date_trunc('month', now())), 0)::float`,
    })
    .from(bookingsTable);

  const [driverStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where is_online = true)::int`,
      avgRating: sql<number>`coalesce(avg(rating::numeric), 0)::float`,
    })
    .from(driversTable);

  const [vehicleStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      available: sql<number>`count(*) filter (where is_available = true)::int`,
    })
    .from(vehiclesTable);

  const [userStats] = await db
    .select({
      passengers: sql<number>`count(*) filter (where role = 'passenger')::int`,
    })
    .from(usersTable);

  const [ticketStats] = await db
    .select({
      open: sql<number>`count(*) filter (where status = 'open')::int`,
    })
    .from(supportTicketsTable);

  res.json(
    GetAdminStatsResponse.parse({
      totalBookings: bookingStats?.total ?? 0,
      activeBookings: bookingStats?.active ?? 0,
      completedToday: bookingStats?.completedToday ?? 0,
      totalRevenue: bookingStats?.totalRevenue ?? 0,
      revenueThisMonth: bookingStats?.revenueThisMonth ?? 0,
      activeDrivers: driverStats?.active ?? 0,
      totalDrivers: driverStats?.total ?? 0,
      fleetSize: vehicleStats?.total ?? 0,
      availableVehicles: vehicleStats?.available ?? 0,
      avgRating: driverStats?.avgRating ?? 0,
      totalPassengers: userStats?.passengers ?? 0,
      openTickets: ticketStats?.open ?? 0,
    })
  );
});

router.get("/admin/recent-bookings", async (req, res): Promise<void> => {
  const parsed = GetRecentBookingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const bookings = await db
    .select()
    .from(bookingsTable)
    .orderBy(desc(bookingsTable.createdAt))
    .limit(parsed.data.limit ?? 10);

  res.json(GetRecentBookingsResponse.parse(bookings.map(parseBooking)));
});

router.get("/admin/revenue", async (_req, res): Promise<void> => {
  const daily = await db
    .select({
      date: sql<string>`date(created_at)::text`,
      revenue: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed'), 0)::float`,
      bookings: sql<number>`count(*)::int`,
    })
    .from(bookingsTable)
    .where(sql`created_at >= now() - interval '30 days'`)
    .groupBy(sql`date(created_at)`)
    .orderBy(sql`date(created_at)`);

  const byVehicleClass = await db
    .select({
      vehicleClass: bookingsTable.vehicleClass,
      revenue: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed'), 0)::float`,
      bookings: sql<number>`count(*)::int`,
    })
    .from(bookingsTable)
    .groupBy(bookingsTable.vehicleClass);

  res.json(GetRevenueStatsResponse.parse({ daily, byVehicleClass }));
});

router.get("/admin/dispatch", async (_req, res): Promise<void> => {
  const [activeTripsRaw, availableDriversRaw, pendingRaw] = await Promise.all([
    db.select().from(bookingsTable).where(eq(bookingsTable.status, "in_progress")),
    db.select().from(driversTable).where(sql`approval_status = 'approved'`),
    db.select().from(bookingsTable).where(eq(bookingsTable.status, "pending")).orderBy(bookingsTable.pickupAt),
  ]);

  res.json(
    GetDispatchBoardResponse.parse({
      activeTrips: activeTripsRaw.map(parseBooking),
      availableDrivers: availableDriversRaw.map(parseDriver),
      pendingBookings: pendingRaw.map(parseBooking),
    })
  );
});

export default router;
