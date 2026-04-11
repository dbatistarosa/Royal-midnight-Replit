import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, driversTable, bookingsTable, settingsTable } from "@workspace/db";
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

router.post("/drivers", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateDriverBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Admin-created drivers are immediately active — no approval flow required
  const [driver] = await db
    .insert(driversTable)
    .values({
      ...parsed.data,
      approvalStatus: "approved",
      status: "active",
    })
    .returning();
  res.status(201).json(GetDriverResponse.parse(parseDriver(driver)));
});

router.get("/drivers/:id", requireAuth, async (req, res): Promise<void> => {
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

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== driver.userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  res.json(GetDriverResponse.parse(parseDriver(driver)));
});

// Public endpoint — returns only passenger-safe driver info for confirmed bookings
router.get("/drivers/:id/public", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] || "0", 10);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, id));
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  res.json({
    id: driver.id,
    name: driver.name,
    phone: driver.phone,
    vehicleYear: driver.vehicleYear,
    vehicleMake: driver.vehicleMake,
    vehicleModel: driver.vehicleModel,
    vehicleColor: driver.vehicleColor,
    profilePicture: driver.profilePicture ?? null,
    rating: driver.rating != null ? parseFloat(driver.rating) : null,
  });
});

router.patch("/drivers/:id", requireAdmin, async (req, res): Promise<void> => {
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

router.patch("/drivers/:id/toggle-availability", requireAuth, async (req, res): Promise<void> => {
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

  const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, params.data.id));
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== driver.userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (parsed.data.isOnline && driver.approvalStatus !== "approved") {
    res.status(403).json({ error: "Driver must be approved before going online" });
    return;
  }

  const [updated] = await db
    .update(driversTable)
    .set({ isOnline: parsed.data.isOnline })
    .where(eq(driversTable.id, params.data.id))
    .returning();

  res.json(ToggleDriverAvailabilityResponse.parse(parseDriver(updated)));
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

// Driver self-service contact info update (phone only)
router.patch("/drivers/:id/contact", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] || "0", 10);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, id));
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== driver.userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const phone = req.body?.phone as string | undefined;
  if (typeof phone !== "string" || phone.trim().length < 7) {
    res.status(400).json({ error: "Invalid phone number" });
    return;
  }

  const [updated] = await db
    .update(driversTable)
    .set({ phone: phone.trim() })
    .where(eq(driversTable.id, id))
    .returning();

  res.json(parseDriver(updated));
});

// Driver payout (banking) info — driver self-service
router.get("/drivers/:id/payout", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] || "0", 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, id));
  if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== driver.userId) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  // Return masked sensitive fields
  res.json({
    payoutLegalName: driver.payoutLegalName ?? "",
    payoutEmail: driver.payoutEmail ?? "",
    payoutBankName: driver.payoutBankName ?? "",
    hasSsn: !!driver.payoutSsn,
    ssnLast4: driver.payoutSsn ? driver.payoutSsn.slice(-4) : null,
    hasRoutingNumber: !!driver.payoutRoutingNumber,
    routingLast4: driver.payoutRoutingNumber ? driver.payoutRoutingNumber.slice(-4) : null,
    hasAccountNumber: !!driver.payoutAccountNumber,
    accountLast4: driver.payoutAccountNumber ? driver.payoutAccountNumber.slice(-4) : null,
  });
});

router.patch("/drivers/:id/payout", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] || "0", 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, id));
  if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== driver.userId) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const { payoutLegalName, payoutEmail, payoutSsn, payoutBankName, payoutRoutingNumber, payoutAccountNumber } =
    req.body as Record<string, string | undefined>;

  const updates: Partial<typeof driversTable.$inferInsert> = {};
  if (payoutLegalName !== undefined) updates.payoutLegalName = payoutLegalName.trim() || null;
  if (payoutEmail !== undefined) updates.payoutEmail = payoutEmail.trim() || null;
  if (payoutBankName !== undefined) updates.payoutBankName = payoutBankName.trim() || null;
  // Only update sensitive fields if a new value is actually provided (non-empty)
  if (payoutSsn && payoutSsn.replace(/\D/g, "").length >= 9) {
    updates.payoutSsn = payoutSsn.replace(/\D/g, "");
  }
  if (payoutRoutingNumber && payoutRoutingNumber.replace(/\D/g, "").length === 9) {
    updates.payoutRoutingNumber = payoutRoutingNumber.replace(/\D/g, "");
  }
  if (payoutAccountNumber && payoutAccountNumber.replace(/\D/g, "").length >= 4) {
    updates.payoutAccountNumber = payoutAccountNumber.replace(/\D/g, "");
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" }); return;
  }

  const [updated] = await db.update(driversTable).set(updates).where(eq(driversTable.id, id)).returning();

  res.json({
    payoutLegalName: updated.payoutLegalName ?? "",
    payoutEmail: updated.payoutEmail ?? "",
    payoutBankName: updated.payoutBankName ?? "",
    hasSsn: !!updated.payoutSsn,
    ssnLast4: updated.payoutSsn ? updated.payoutSsn.slice(-4) : null,
    hasRoutingNumber: !!updated.payoutRoutingNumber,
    routingLast4: updated.payoutRoutingNumber ? updated.payoutRoutingNumber.slice(-4) : null,
    hasAccountNumber: !!updated.payoutAccountNumber,
    accountLast4: updated.payoutAccountNumber ? updated.payoutAccountNumber.slice(-4) : null,
  });
});

// Driver location update — driver sends GPS coords every 30 seconds when sharing is enabled
router.patch("/drivers/:id/location", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] || "0", 10);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const lat = parseFloat(req.body?.lat);
  const lng = parseFloat(req.body?.lng);
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: "lat and lng are required and must be valid coordinates" });
    return;
  }

  const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, id));
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== driver.userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [updated] = await db
    .update(driversTable)
    .set({ latitude: String(lat), longitude: String(lng), locationUpdatedAt: new Date() })
    .where(eq(driversTable.id, id))
    .returning();

  res.json({ id: updated.id, latitude: updated.latitude, longitude: updated.longitude, locationUpdatedAt: updated.locationUpdatedAt });
});

// Driver self-service status update (available / on_break / unavailable)
router.patch("/drivers/:id/status", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] || "0", 10);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const allowed = ["available", "on_break", "unavailable"] as const;
  const newStatus = req.body?.status as string;
  if (!allowed.includes(newStatus as typeof allowed[number])) {
    res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
    return;
  }

  const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, id));
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== driver.userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (driver.approvalStatus !== "approved") {
    res.status(403).json({ error: "Driver must be approved to change availability" });
    return;
  }

  const [updated] = await db
    .update(driversTable)
    .set({ status: newStatus, isOnline: newStatus === "available" })
    .where(eq(driversTable.id, id))
    .returning();

  res.json(parseDriver(updated));
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
    .set({ approvalStatus: "rejected", status: "rejected", rejectionReason: reason || null })
    .where(eq(driversTable.id, id))
    .returning();

  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  res.json({ success: true, driver: parseDriver(driver) });
});

router.get("/drivers/:id/earnings", requireAuth, async (req, res): Promise<void> => {
  const params = GetDriverEarningsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const driverId = params.data.id;
  const caller = req.currentUser!;

  const [driver] = await db.select({ id: driversTable.id, userId: driversTable.userId }).from(driversTable).where(eq(driversTable.id, driverId));
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  if (caller.role !== "admin" && caller.userId !== driver.userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  // Fetch commission rate from settings (stored as whole percent, e.g. "70" = 70%); divide by 100 for multiplier
  const [commissionRow] = await db.select().from(settingsTable).where(eq(settingsTable.key, "driver_commission_pct"));
  const commissionPct = commissionRow ? parseFloat(commissionRow.value) / 100 : 0.70;

  const [stats] = await db
    .select({
      totalEarnings: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed'), 0)::float`,
      thisMonth: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed' and date_trunc('month', created_at) = date_trunc('month', now())), 0)::float`,
      thisWeek: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed' and created_at >= date_trunc('week', now())), 0)::float`,
      today: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed' and created_at::date = current_date), 0)::float`,
      totalRides: sql<number>`count(*) filter (where status = 'completed')::int`,
      tipsTotal: sql<number>`coalesce(sum(tip_amount::numeric) filter (where status = 'completed' and tip_amount is not null), 0)::float`,
      tipsThisWeek: sql<number>`coalesce(sum(tip_amount::numeric) filter (where status = 'completed' and tip_amount is not null and created_at >= date_trunc('week', now())), 0)::float`,
      tipsToday: sql<number>`coalesce(sum(tip_amount::numeric) filter (where status = 'completed' and tip_amount is not null and created_at::date = current_date), 0)::float`,
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
  const totalEarnings = (stats?.totalEarnings ?? 0) * commissionPct;

  const recentPayouts = dailyRaw.map(d => ({ ...d, amount: d.amount * commissionPct }));

  res.json(
    GetDriverEarningsResponse.parse({
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      thisMonth: Math.round((stats?.thisMonth ?? 0) * commissionPct * 100) / 100,
      thisWeek: Math.round((stats?.thisWeek ?? 0) * commissionPct * 100) / 100,
      today: Math.round((stats?.today ?? 0) * commissionPct * 100) / 100,
      totalRides,
      avgPerRide: totalRides > 0 ? Math.round((totalEarnings / totalRides) * 100) / 100 : 0,
      tipsTotal: Math.round((stats?.tipsTotal ?? 0) * 100) / 100,
      tipsThisWeek: Math.round((stats?.tipsThisWeek ?? 0) * 100) / 100,
      tipsToday: Math.round((stats?.tipsToday ?? 0) * 100) / 100,
      recentPayouts,
    })
  );
});

export default router;
