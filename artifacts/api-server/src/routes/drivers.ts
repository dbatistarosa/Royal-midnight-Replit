import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, driversTable, bookingsTable } from "@workspace/db";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import {
  ListDriversQueryParams,
  ListDriversResponse,
  CreateDriverBody,
  GetDriverParams,
  GetDriverResponse,
  UpdateDriverParams,
  UpdateDriverBody,
  UpdateDriverResponse,
  ToggleDriverAvailabilityParams,
  ToggleDriverAvailabilityBody,
  ToggleDriverAvailabilityResponse,
  GetDriverEarningsParams,
  GetDriverEarningsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseDriver(d: typeof driversTable.$inferSelect) {
  return {
    ...d,
    rating: d.rating != null ? parseFloat(d.rating) : null,
    createdAt: d.createdAt.toISOString(),
  };
}

router.get("/drivers", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListDriversQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const drivers = await db
    .select()
    .from(driversTable)
    .where(parsed.data.status ? eq(driversTable.status, parsed.data.status) : undefined);

  res.json(drivers.map(parseDriver));
});

router.post("/drivers", async (req, res): Promise<void> => {
  const parsed = CreateDriverBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [driver] = await db.insert(driversTable).values(parsed.data).returning();
  res.status(201).json(GetDriverResponse.parse(parseDriver(driver)));
});

router.get("/drivers/:id", async (req, res): Promise<void> => {
  const params = GetDriverParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, params.data.id));
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  res.json(GetDriverResponse.parse(parseDriver(driver)));
});

router.patch("/drivers/:id", async (req, res): Promise<void> => {
  const params = UpdateDriverParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateDriverBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.status != null) updateData.status = parsed.data.status;
  if (parsed.data.rating != null) updateData.rating = String(parsed.data.rating);

  const [driver] = await db
    .update(driversTable)
    .set(updateData)
    .where(eq(driversTable.id, params.data.id))
    .returning();

  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  res.json(UpdateDriverResponse.parse(parseDriver(driver)));
});

router.patch("/drivers/:id/toggle-availability", async (req, res): Promise<void> => {
  const params = ToggleDriverAvailabilityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ToggleDriverAvailabilityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [driver] = await db
    .update(driversTable)
    .set({ isOnline: parsed.data.isOnline })
    .where(eq(driversTable.id, params.data.id))
    .returning();

  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  res.json(ToggleDriverAvailabilityResponse.parse(parseDriver(driver)));
});

router.get("/drivers/by-user/:userId", requireAuth, async (req, res): Promise<void> => {
  const userId = parseInt(req.params["userId"] || "0", 10);
  if (!userId) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [driver] = await db.select().from(driversTable).where(eq(driversTable.userId, userId));
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  res.json(parseDriver(driver));
});

router.patch("/drivers/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] || "0", 10);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [driver] = await db
    .update(driversTable)
    .set({ approvalStatus: "approved", status: "active" })
    .where(eq(driversTable.id, id))
    .returning();

  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  res.json({ success: true, driver: parseDriver(driver) });
});

router.patch("/drivers/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] || "0", 10);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const reason = (req.body?.reason as string) || "";

  const [driver] = await db
    .update(driversTable)
    .set({ approvalStatus: "rejected", status: "inactive", rejectionReason: reason || null })
    .where(eq(driversTable.id, id))
    .returning();

  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  res.json({ success: true, driver: parseDriver(driver) });
});

router.get("/drivers/:id/earnings", async (req, res): Promise<void> => {
  const params = GetDriverEarningsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const driverId = params.data.id;

  const [stats] = await db
    .select({
      totalEarnings: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed'), 0)::float`,
      thisMonth: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed' and date_trunc('month', created_at) = date_trunc('month', now())), 0)::float`,
      thisWeek: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed' and created_at >= date_trunc('week', now())), 0)::float`,
      today: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed' and created_at::date = current_date), 0)::float`,
      totalRides: sql<number>`count(*) filter (where status = 'completed')::int`,
    })
    .from(bookingsTable)
    .where(eq(bookingsTable.driverId, driverId));

  const dailyRaw = await db
    .select({
      date: sql<string>`date(created_at)::text`,
      amount: sql<number>`coalesce(sum(price_quoted::numeric), 0)::float`,
      rides: sql<number>`count(*)::int`,
    })
    .from(bookingsTable)
    .where(sql`driver_id = ${driverId} and status = 'completed' and created_at >= now() - interval '30 days'`)
    .groupBy(sql`date(created_at)`)
    .orderBy(sql`date(created_at)`);

  const totalRides = stats?.totalRides ?? 0;
  const totalEarnings = stats?.totalEarnings ?? 0;

  res.json(
    GetDriverEarningsResponse.parse({
      totalEarnings,
      thisMonth: stats?.thisMonth ?? 0,
      thisWeek: stats?.thisWeek ?? 0,
      today: stats?.today ?? 0,
      totalRides,
      avgPerRide: totalRides > 0 ? Math.round((totalEarnings / totalRides) * 100) / 100 : 0,
      recentPayouts: dailyRaw,
    })
  );
});

export default router;
