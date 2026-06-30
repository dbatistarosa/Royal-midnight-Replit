import { Router, type IRouter } from "express";
import { eq, sql, desc, and, inArray } from "drizzle-orm";
import crypto from "crypto";
import { db, driversTable, bookingsTable, settingsTable, usersTable, complianceDocumentsTable, driverLocationsTable, passwordResetTokensTable, driverVehiclesTable } from "@workspace/db";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { encryptField, lastN, safeDecryptField } from "../lib/encrypt.js";
import { fetchCommissionPct } from "../lib/commission.js";
import { hashPassword } from "../lib/hash.js";
import { sendDriverAccountSetupEmail } from "../lib/mailer.js";
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
  // payoutSsn/payoutRoutingNumber/payoutAccountNumber are encrypted at rest,
  // but general-purpose driver responses shouldn't carry the ciphertext at
  // all — callers who need this data use the dedicated, properly-masked
  // GET /drivers/:id/payout endpoint instead.
  const { payoutSsn, payoutRoutingNumber, payoutAccountNumber, ...rest } = d;
  return {
    ...rest,
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

  const email = parsed.data.email;
  const [existingUser] = await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(eq(usersTable.email, email));
  if (existingUser) {
    const msg = existingUser.role === "driver"
      ? "A driver account with this email already exists."
      : "This email is already registered as a passenger or admin account. Each email can only be used for one portal.";
    res.status(400).json({ error: msg });
    return;
  }
  const [existingDriverRecord] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.email, email));
  if (existingDriverRecord) {
    res.status(400).json({ error: "A driver record with this email already exists." });
    return;
  }

  // Admin-created drivers are immediately active — no approval flow required.
  // They still need a login: create a linked user account with an unusable
  // random password, then email them a set-password link (same mechanism as
  // forgot-password) so they can sign in and upload their documents.
  const { driver } = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(usersTable)
      .values({
        name: parsed.data.name,
        email,
        phone: parsed.data.phone,
        role: "driver",
        passwordHash: hashPassword(crypto.randomBytes(32).toString("hex")),
      })
      .returning();

    const [driver] = await tx
      .insert(driversTable)
      .values({
        ...parsed.data,
        userId: user.id,
        approvalStatus: "approved",
        status: "active",
      })
      .returning();

    return { user, driver };
  });

  const setupToken = crypto.randomBytes(32).toString("hex");
  const setupExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await db.insert(passwordResetTokensTable).values({ userId: driver.userId!, token: setupToken, expiresAt: setupExpiresAt });

  const APP_URL = process.env.APP_URL ?? "https://royalmidnight.com";
  const setupLink = `${APP_URL}/auth/reset-password?token=${setupToken}`;
  sendDriverAccountSetupEmail(email, parsed.data.name, setupLink)
    .catch(err => req.log.error({ err }, "[drivers] account setup email failed"));

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
  if (parsed.data.approvalStatus != null) updateData.approvalStatus = parsed.data.approvalStatus;
  if (parsed.data.rating != null) updateData.rating = String(parsed.data.rating);
  if (parsed.data.name != null) updateData.name = parsed.data.name;
  if (parsed.data.phone != null) updateData.phone = parsed.data.phone;
  if (parsed.data.vehicleMake !== undefined) updateData.vehicleMake = parsed.data.vehicleMake ?? null;
  if (parsed.data.vehicleModel !== undefined) updateData.vehicleModel = parsed.data.vehicleModel ?? null;
  if (parsed.data.vehicleYear !== undefined) updateData.vehicleYear = parsed.data.vehicleYear ?? null;
  if (parsed.data.vehicleColor !== undefined) updateData.vehicleColor = parsed.data.vehicleColor ?? null;
  if (parsed.data.vehicleClass !== undefined) updateData.vehicleClass = parsed.data.vehicleClass ?? null;
  if (parsed.data.passengerCapacity !== undefined) updateData.passengerCapacity = parsed.data.passengerCapacity ?? null;
  if (parsed.data.licenseNumber !== undefined) updateData.licenseNumber = parsed.data.licenseNumber ?? null;

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

// Statuses where a driver is actively en route to / with a passenger — used to
// tag live GPS pings with the trip they belong to (distinct from
// ACTIVE_TRIP_STATUSES in bookings.ts, which is about scheduling-conflict
// detection, not "what trip is happening right now").
const LIVE_TRACKING_STATUSES = ["on_way", "on_location", "in_progress"] as const;

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

  const [liveBooking] = await db
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(and(eq(bookingsTable.driverId, id), inArray(bookingsTable.status, LIVE_TRACKING_STATUSES)));

  // History row for the driver_locations table — Realtime (enabled via the
  // supabase_realtime publication) broadcasts this insert to any subscribed
  // map client automatically, no extra code needed here.
  await db.insert(driverLocationsTable).values({
    driverId: id,
    bookingId: liveBooking?.id ?? null,
    latitude: lat,
    longitude: lng,
  });

  res.json({ id: updated.id, latitude: updated.latitude, longitude: updated.longitude, locationUpdatedAt: updated.locationUpdatedAt });
});

// Driver mobile app registers/refreshes its Expo push token here on every login/foreground.
router.patch("/drivers/:id/push-token", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] || "0", 10);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { pushToken, pushPlatform } = req.body as { pushToken?: string; pushPlatform?: string };
  if (!pushToken || (pushPlatform !== "ios" && pushPlatform !== "android")) {
    res.status(400).json({ error: "pushToken and pushPlatform ('ios'|'android') are required" });
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
    .set({ pushToken, pushPlatform })
    .where(eq(driversTable.id, id))
    .returning();

  res.json({ id: updated.id, pushPlatform: updated.pushPlatform });
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

  // Optional date range filter from query params (validated)
  const rawStart = req.query["startDate"] as string | undefined;
  const rawEnd = req.query["endDate"] as string | undefined;
  const filterStartRaw = rawStart ? new Date(rawStart) : null;
  const filterEndRaw = rawEnd ? new Date(rawEnd) : null;
  if (filterStartRaw !== null && isNaN(filterStartRaw.getTime())) {
    res.status(400).json({ error: "Invalid startDate — must be a parseable ISO date string." });
    return;
  }
  if (filterEndRaw !== null && isNaN(filterEndRaw.getTime())) {
    res.status(400).json({ error: "Invalid endDate — must be a parseable ISO date string." });
    return;
  }
  const filterStart = filterStartRaw;
  const filterEnd = filterEndRaw;

  // Track fare and tips separately — commission applies only to fares, tips pass through 100%.
  // coalesce(fare_subtotal, price_quoted) = pre-tax/pre-fee/pre-discount commission base,
  // falling back to price_quoted only for legacy rows that predate the fare_subtotal column.
  const [stats] = await db
    .select({
      fareTotal: sql<number>`coalesce(sum(coalesce(fare_subtotal, price_quoted)::numeric) filter (where status = 'completed'), 0)::float`,
      fareThisMonth: sql<number>`coalesce(sum(coalesce(fare_subtotal, price_quoted)::numeric) filter (where status = 'completed' and date_trunc('month', created_at) = date_trunc('month', now())), 0)::float`,
      fareThisWeek: sql<number>`coalesce(sum(coalesce(fare_subtotal, price_quoted)::numeric) filter (where status = 'completed' and created_at >= date_trunc('week', now())), 0)::float`,
      fareToday: sql<number>`coalesce(sum(coalesce(fare_subtotal, price_quoted)::numeric) filter (where status = 'completed' and created_at::date = current_date), 0)::float`,
      totalRides: sql<number>`count(*) filter (where status = 'completed')::int`,
      tipsTotal: sql<number>`coalesce(sum(tip_amount::numeric) filter (where status = 'completed' and tip_amount is not null), 0)::float`,
      tipsThisMonth: sql<number>`coalesce(sum(tip_amount::numeric) filter (where status = 'completed' and tip_amount is not null and date_trunc('month', created_at) = date_trunc('month', now())), 0)::float`,
      tipsThisWeek: sql<number>`coalesce(sum(tip_amount::numeric) filter (where status = 'completed' and tip_amount is not null and created_at >= date_trunc('week', now())), 0)::float`,
      tipsToday: sql<number>`coalesce(sum(tip_amount::numeric) filter (where status = 'completed' and tip_amount is not null and created_at::date = current_date), 0)::float`,
      // Period-scoped aggregates (only populated when date range is provided)
      farePeriod: sql<number>`coalesce(sum(coalesce(fare_subtotal, price_quoted)::numeric) filter (where status = 'completed' and (${filterStart ? sql`created_at >= ${filterStart}` : sql`true`}) and (${filterEnd ? sql`created_at <= ${filterEnd}` : sql`true`})), 0)::float`,
      tipsPeriod: sql<number>`coalesce(sum(tip_amount::numeric) filter (where status = 'completed' and tip_amount is not null and (${filterStart ? sql`created_at >= ${filterStart}` : sql`true`}) and (${filterEnd ? sql`created_at <= ${filterEnd}` : sql`true`})), 0)::float`,
      ridesPeriod: sql<number>`count(*) filter (where status = 'completed' and (${filterStart ? sql`created_at >= ${filterStart}` : sql`true`}) and (${filterEnd ? sql`created_at <= ${filterEnd}` : sql`true`}))::int`,
    })
    .from(bookingsTable)
    .where(eq(bookingsTable.driverId, driverId));

  // Daily chart: commission on fare + 100% of tip
  // Honor one-sided or two-sided bounds; fall back to last 30 days when no bounds are given.
  const hasAnyBound = filterStart !== null || filterEnd !== null;
  const dailyWhere = hasAnyBound
    ? sql`driver_id = ${driverId} and status = 'completed'
          and (${filterStart ? sql`created_at >= ${filterStart}` : sql`true`})
          and (${filterEnd ? sql`created_at <= ${filterEnd}` : sql`true`})`
    : sql`driver_id = ${driverId} and status = 'completed' and created_at >= now() - interval '30 days'`;

  const dailyRaw = await db
    .select({
      date: sql<string>`date(created_at)::text`,
      fare: sql<number>`coalesce(sum(coalesce(fare_subtotal, price_quoted)::numeric), 0)::float`,
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

// ── Driver Vehicles (multi-vehicle support) ───────────────────────────────────

function canAccessDriver(caller: { role: string; userId: number }, driverUserId: number | null): boolean {
  return caller.role === "admin" || (driverUserId != null && caller.userId === driverUserId);
}

router.get("/drivers/:id/vehicles", requireAuth, async (req, res): Promise<void> => {
  const driverId = parseInt(req.params["id"] ?? "", 10);
  if (!driverId) { res.status(400).json({ error: "Invalid id" }); return; }
  const [driver] = await db.select({ userId: driversTable.userId }).from(driversTable).where(eq(driversTable.id, driverId));
  if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }
  if (!canAccessDriver(req.currentUser!, driver.userId)) { res.status(403).json({ error: "Access denied" }); return; }
  const vehicles = await db.select().from(driverVehiclesTable).where(eq(driverVehiclesTable.driverId, driverId)).orderBy(desc(driverVehiclesTable.isDefault), driverVehiclesTable.createdAt);
  res.json(vehicles);
});

router.post("/drivers/:id/vehicles", requireAuth, async (req, res): Promise<void> => {
  const driverId = parseInt(req.params["id"] ?? "", 10);
  if (!driverId) { res.status(400).json({ error: "Invalid id" }); return; }
  const [driver] = await db.select({ userId: driversTable.userId }).from(driversTable).where(eq(driversTable.id, driverId));
  if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }
  if (!canAccessDriver(req.currentUser!, driver.userId)) { res.status(403).json({ error: "Access denied" }); return; }
  const { year, make, model, color, vehicleClass, passengerCapacity, luggageCapacity, hasCarSeat, regPlate, isDefault } = req.body as Record<string, unknown>;
  if (!make || !model) { res.status(400).json({ error: "make and model are required" }); return; }
  if (isDefault) {
    await db.update(driverVehiclesTable).set({ isDefault: false }).where(eq(driverVehiclesTable.driverId, driverId));
  }
  const [v] = await db.insert(driverVehiclesTable).values({
    driverId, year: year as string ?? null, make: make as string, model: model as string,
    color: color as string ?? null, vehicleClass: vehicleClass as string ?? null,
    passengerCapacity: passengerCapacity as number ?? null, luggageCapacity: luggageCapacity as number ?? null,
    hasCarSeat: (hasCarSeat as boolean) ?? false, regPlate: regPlate as string ?? null,
    isDefault: (isDefault as boolean) ?? false,
  }).returning();
  res.status(201).json(v);
});

router.patch("/drivers/:id/vehicles/:vehicleId", requireAuth, async (req, res): Promise<void> => {
  const driverId = parseInt(req.params["id"] ?? "", 10);
  const vehicleId = parseInt(req.params["vehicleId"] ?? "", 10);
  if (!driverId || !vehicleId) { res.status(400).json({ error: "Invalid id" }); return; }
  const [driver] = await db.select({ userId: driversTable.userId }).from(driversTable).where(eq(driversTable.id, driverId));
  if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }
  if (!canAccessDriver(req.currentUser!, driver.userId)) { res.status(403).json({ error: "Access denied" }); return; }
  const body = req.body as Record<string, unknown>;
  const updateData: Record<string, unknown> = {};
  if (body.year !== undefined) updateData.year = body.year ?? null;
  if (body.make !== undefined) updateData.make = body.make;
  if (body.model !== undefined) updateData.model = body.model;
  if (body.color !== undefined) updateData.color = body.color ?? null;
  if (body.vehicleClass !== undefined) updateData.vehicleClass = body.vehicleClass ?? null;
  if (body.passengerCapacity !== undefined) updateData.passengerCapacity = body.passengerCapacity ?? null;
  if (body.luggageCapacity !== undefined) updateData.luggageCapacity = body.luggageCapacity ?? null;
  if (body.hasCarSeat !== undefined) updateData.hasCarSeat = body.hasCarSeat;
  if (body.regPlate !== undefined) updateData.regPlate = body.regPlate ?? null;
  if (body.isDefault === true) {
    await db.update(driverVehiclesTable).set({ isDefault: false }).where(eq(driverVehiclesTable.driverId, driverId));
    updateData.isDefault = true;
  }
  const [v] = await db.update(driverVehiclesTable).set(updateData).where(and(eq(driverVehiclesTable.id, vehicleId), eq(driverVehiclesTable.driverId, driverId))).returning();
  if (!v) { res.status(404).json({ error: "Vehicle not found" }); return; }
  res.json(v);
});

router.delete("/drivers/:id/vehicles/:vehicleId", requireAuth, async (req, res): Promise<void> => {
  const driverId = parseInt(req.params["id"] ?? "", 10);
  const vehicleId = parseInt(req.params["vehicleId"] ?? "", 10);
  if (!driverId || !vehicleId) { res.status(400).json({ error: "Invalid id" }); return; }
  const [driver] = await db.select({ userId: driversTable.userId }).from(driversTable).where(eq(driversTable.id, driverId));
  if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }
  if (!canAccessDriver(req.currentUser!, driver.userId)) { res.status(403).json({ error: "Access denied" }); return; }
  await db.delete(driverVehiclesTable).where(and(eq(driverVehiclesTable.id, vehicleId), eq(driverVehiclesTable.driverId, driverId)));
  res.sendStatus(204);
});

export default router;
