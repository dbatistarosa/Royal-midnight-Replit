import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, driversTable, bookingsTable, settingsTable, usersTable, complianceDocumentsTable } from "@workspace/db";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { encryptField, lastN, safeDecryptField } from "../lib/encrypt.js";
import { fetchCommissionPct } from "../lib/commission.js";
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

  // Primary lookup: by userId foreign key.
  // Order by total_rides DESC so that when a driver has two records (one admin-created
  // with bookings, one from the onboarding flow), we always return the one with activity.
  const byUserId = await db.select().from(driversTable)
    .where(eq(driversTable.userId, userId))
    .orderBy(desc(driversTable.totalRides));
  let driver = byUserId[0];

  // Fallback: match by email for drivers whose userId link was never set
  if (!driver) {
    const [callerUser] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
    if (callerUser?.email) {
      // Pick the record with the most rides if multiple email-matched records exist
      const byEmail = await db.select().from(driversTable)
        .where(eq(driversTable.email, callerUser.email))
        .orderBy(desc(driversTable.totalRides));
      driver = byEmail[0];
      // Retroactively link userId so future lookups use the fast path
      if (driver) {
        db.update(driversTable).set({ userId }).where(eq(driversTable.id, driver.id))
          .catch(err => req.log.error({ err }, "[drivers/by-user] retroactive userId link error"));
      }
    }
  }

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
  const profilePicture = req.body?.profilePicture as string | undefined;

  const updates: Partial<typeof driversTable.$inferInsert> = {};

  if (phone !== undefined) {
    if (typeof phone !== "string" || phone.trim().length < 7) {
      res.status(400).json({ error: "Invalid phone number" });
      return;
    }
    updates.phone = phone.trim();
  }

  if (profilePicture !== undefined) {
    if (typeof profilePicture !== "string" || !profilePicture.startsWith("/")) {
      res.status(400).json({ error: "Invalid profile picture path" });
      return;
    }
    updates.profilePicture = profilePicture;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(driversTable)
    .set(updates)
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

  // Return masked sensitive fields — never return raw SSN/routing/account
  res.json({
    payoutLegalName: driver.payoutLegalName ?? "",
    payoutEmail: driver.payoutEmail ?? "",
    payoutBankName: driver.payoutBankName ?? "",
    hasSsn: !!driver.payoutSsn,
    ssnLast4: lastN(driver.payoutSsn, 4),
    hasRoutingNumber: !!driver.payoutRoutingNumber,
    routingLast4: lastN(driver.payoutRoutingNumber, 4),
    hasAccountNumber: !!driver.payoutAccountNumber,
    accountLast4: lastN(driver.payoutAccountNumber, 4),
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
  // Encrypt sensitive fields before storage
  if (payoutSsn && payoutSsn.replace(/\D/g, "").length >= 9) {
    updates.payoutSsn = encryptField(payoutSsn.replace(/\D/g, ""));
  }
  if (payoutRoutingNumber && payoutRoutingNumber.replace(/\D/g, "").length === 9) {
    updates.payoutRoutingNumber = encryptField(payoutRoutingNumber.replace(/\D/g, ""));
  }
  if (payoutAccountNumber && payoutAccountNumber.replace(/\D/g, "").length >= 4) {
    updates.payoutAccountNumber = encryptField(payoutAccountNumber.replace(/\D/g, ""));
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
    ssnLast4: lastN(updated.payoutSsn, 4),
    hasRoutingNumber: !!updated.payoutRoutingNumber,
    routingLast4: lastN(updated.payoutRoutingNumber, 4),
    hasAccountNumber: !!updated.payoutAccountNumber,
    accountLast4: lastN(updated.payoutAccountNumber, 4),
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

  const commissionPct = await fetchCommissionPct();

  // Optional date range filter from query params
  const rawStart = req.query["startDate"] as string | undefined;
  const rawEnd = req.query["endDate"] as string | undefined;
  const filterStart = rawStart ? new Date(rawStart) : null;
  const filterEnd = rawEnd ? new Date(rawEnd) : null;

  // Track fare and tips separately — commission applies only to fares, tips pass through 100%
  const [stats] = await db
    .select({
      fareTotal: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed'), 0)::float`,
      fareThisMonth: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed' and date_trunc('month', created_at) = date_trunc('month', now())), 0)::float`,
      fareThisWeek: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed' and created_at >= date_trunc('week', now())), 0)::float`,
      fareToday: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed' and created_at::date = current_date), 0)::float`,
      totalRides: sql<number>`count(*) filter (where status = 'completed')::int`,
      tipsTotal: sql<number>`coalesce(sum(tip_amount::numeric) filter (where status = 'completed' and tip_amount is not null), 0)::float`,
      tipsThisMonth: sql<number>`coalesce(sum(tip_amount::numeric) filter (where status = 'completed' and tip_amount is not null and date_trunc('month', created_at) = date_trunc('month', now())), 0)::float`,
      tipsThisWeek: sql<number>`coalesce(sum(tip_amount::numeric) filter (where status = 'completed' and tip_amount is not null and created_at >= date_trunc('week', now())), 0)::float`,
      tipsToday: sql<number>`coalesce(sum(tip_amount::numeric) filter (where status = 'completed' and tip_amount is not null and created_at::date = current_date), 0)::float`,
      // Period-scoped aggregates (only populated when date range is provided)
      farePeriod: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed' and (${filterStart ? sql`created_at >= ${filterStart}` : sql`true`}) and (${filterEnd ? sql`created_at <= ${filterEnd}` : sql`true`})), 0)::float`,
      tipsPeriod: sql<number>`coalesce(sum(tip_amount::numeric) filter (where status = 'completed' and tip_amount is not null and (${filterStart ? sql`created_at >= ${filterStart}` : sql`true`}) and (${filterEnd ? sql`created_at <= ${filterEnd}` : sql`true`})), 0)::float`,
      ridesPeriod: sql<number>`count(*) filter (where status = 'completed' and (${filterStart ? sql`created_at >= ${filterStart}` : sql`true`}) and (${filterEnd ? sql`created_at <= ${filterEnd}` : sql`true`}))::int`,
    })
    .from(bookingsTable)
    .where(eq(bookingsTable.driverId, driverId));

  // Daily chart: commission on fare + 100% of tip
  // When a date range is provided, scope the chart to that window; otherwise show last 30 days.
  const dailyWhere = filterStart && filterEnd
    ? sql`driver_id = ${driverId} and status = 'completed' and created_at >= ${filterStart} and created_at <= ${filterEnd}`
    : sql`driver_id = ${driverId} and status = 'completed' and created_at >= now() - interval '30 days'`;

  const dailyRaw = await db
    .select({
      date: sql<string>`date(created_at)::text`,
      fare: sql<number>`coalesce(sum(price_quoted::numeric), 0)::float`,
      tip: sql<number>`coalesce(sum(coalesce(tip_amount, 0)::numeric), 0)::float`,
      rides: sql<number>`count(*)::int`,
    })
    .from(bookingsTable)
    .where(dailyWhere)
    .groupBy(sql`date(created_at)`)
    .orderBy(sql`date(created_at)`);

  const totalRides = stats?.totalRides ?? 0;
  const commissionAllTime = Math.round((stats?.fareTotal ?? 0) * commissionPct * 100) / 100;
  const commissionThisWeek = Math.round((stats?.fareThisWeek ?? 0) * commissionPct * 100) / 100;
  const tipsTotal = Math.round((stats?.tipsTotal ?? 0) * 100) / 100;
  const tipsThisWeek = Math.round((stats?.tipsThisWeek ?? 0) * 100) / 100;
  const tipsToday = Math.round((stats?.tipsToday ?? 0) * 100) / 100;

  // Period-scoped totals
  const periodCommission = Math.round((stats?.farePeriod ?? 0) * commissionPct * 100) / 100;
  const periodTips = Math.round((stats?.tipsPeriod ?? 0) * 100) / 100;
  const periodEarnings = Math.round((periodCommission + periodTips) * 100) / 100;
  const periodRides = stats?.ridesPeriod ?? 0;

  // Total driver payout = commission (% of fare) + tips (100%)
  const totalEarnings = Math.round((commissionAllTime + tipsTotal) * 100) / 100;
  const thisWeek = Math.round((commissionThisWeek + tipsThisWeek) * 100) / 100;
  const thisMonth = Math.round(((stats?.fareThisMonth ?? 0) * commissionPct + (stats?.tipsThisMonth ?? 0)) * 100) / 100;
  const today = Math.round(((stats?.fareToday ?? 0) * commissionPct + tipsToday) * 100) / 100;

  const recentPayouts = dailyRaw.map(d => ({
    date: d.date,
    rides: d.rides,
    amount: Math.round((d.fare * commissionPct + d.tip) * 100) / 100,
  }));

  res.json(
    GetDriverEarningsResponse.parse({
      totalEarnings,
      thisMonth,
      thisWeek,
      today,
      totalRides,
      avgPerRide: totalRides > 0 ? Math.round((totalEarnings / totalRides) * 100) / 100 : 0,
      commissionAllTime,
      commissionThisWeek,
      tipsTotal,
      tipsThisWeek,
      tipsToday,
      periodEarnings,
      periodRides,
      periodTips,
      commissionPct,
      recentPayouts,
    })
  );
});

// ─── Compliance Documents (driver self-service) ──────────────────────────────

/**
 * GET /drivers/:id/documents
 * Returns the driver's compliance document submissions and current expiry dates.
 */
router.get("/drivers/:id/documents", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [driver] = await db.select({
    id: driversTable.id,
    userId: driversTable.userId,
    email: driversTable.email,
    licenseExpiry: driversTable.licenseExpiry,
    regExpiry: driversTable.regExpiry,
    insuranceExpiry: driversTable.insuranceExpiry,
    complianceHold: driversTable.complianceHold,
  }).from(driversTable).where(eq(driversTable.id, id));

  if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }

  const caller = req.currentUser!;
  if (caller.role !== "admin") {
    const [callerUser] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, caller.userId));
    const emailMatch = callerUser?.email?.toLowerCase() === driver.email.toLowerCase();
    if (driver.userId !== caller.userId && !emailMatch) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
  }

  // Most recent submission per doc type
  const docs = await db.select().from(complianceDocumentsTable)
    .where(eq(complianceDocumentsTable.driverId, id))
    .orderBy(desc(complianceDocumentsTable.submittedAt));

  res.json({
    currentExpiries: {
      "Driver License": driver.licenseExpiry,
      "Vehicle Registration": driver.regExpiry,
      "Insurance": driver.insuranceExpiry,
    },
    complianceHold: driver.complianceHold,
    submissions: docs.map(d => ({
      ...d,
      submittedAt: d.submittedAt.toISOString(),
      reviewedAt: d.reviewedAt ? d.reviewedAt.toISOString() : null,
    })),
  });
});

/**
 * POST /drivers/:id/documents
 * Driver submits a new compliance document for review.
 */
router.post("/drivers/:id/documents", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [driver] = await db.select({
    id: driversTable.id, userId: driversTable.userId, email: driversTable.email,
  }).from(driversTable).where(eq(driversTable.id, id));

  if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }

  const caller = req.currentUser!;
  if (caller.role !== "admin") {
    const [callerUser] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, caller.userId));
    const emailMatch = callerUser?.email?.toLowerCase() === driver.email.toLowerCase();
    if (driver.userId !== caller.userId && !emailMatch) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
  }

  const { docType, fileUrl, newExpiry } = req.body as { docType?: string; fileUrl?: string; newExpiry?: string };
  const validTypes = ["Driver License", "Vehicle Registration", "Insurance"];
  if (!docType || !validTypes.includes(docType)) {
    res.status(400).json({ error: `docType must be one of: ${validTypes.join(", ")}` });
    return;
  }
  if (!fileUrl) {
    res.status(400).json({ error: "fileUrl is required" });
    return;
  }

  const [newDoc] = await db.insert(complianceDocumentsTable).values({
    driverId: id,
    docType,
    fileUrl,
    newExpiry: newExpiry ?? null,
    status: "pending_review",
  }).returning();

  res.status(201).json({
    ...newDoc,
    submittedAt: newDoc.submittedAt.toISOString(),
    reviewedAt: null,
  });
});

export default router;
