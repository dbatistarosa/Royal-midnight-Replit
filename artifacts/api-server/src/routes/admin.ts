import { Router, type IRouter } from "express";
import { sql, desc, eq } from "drizzle-orm";
import { db, bookingsTable, driversTable, vehiclesTable, usersTable, supportTicketsTable, settingsTable, emailLogsTable, vehicleCatalogTable } from "@workspace/db";
import { requireAdmin } from "../middleware/auth.js";
import { getMailerStatus, ADMIN_EMAIL } from "../lib/mailer.js";
import { Resend } from "resend";
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

router.get("/admin/stats", requireAdmin, async (_req, res): Promise<void> => {
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

router.get("/admin/recent-bookings", requireAdmin, async (req, res): Promise<void> => {
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

router.get("/admin/revenue", requireAdmin, async (req, res): Promise<void> => {
  // ── Date range params ────────────────────────────────────────────────────────
  const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  // Build a SQL fragment for date-scoping completed bookings
  const dateFilter = start && end
    ? sql`status = 'completed' AND pickup_at >= ${start.toISOString()} AND pickup_at < ${end.toISOString()}`
    : sql`status = 'completed'`;
  const completedFilter = start && end
    ? sql`status = 'completed' AND pickup_at >= ${start.toISOString()} AND pickup_at < ${end.toISOString()}`
    : sql`status = 'completed'`;

  // ── Load all settings in one pass ────────────────────────────────────────────
  const settingRows = await db.select().from(settingsTable);
  const settingsMap: Record<string, string> = {};
  for (const row of settingRows) settingsMap[row.key] = row.value;

  const rawComm = parseFloat(settingsMap["driver_commission_pct"] ?? "70");
  const commissionPct = rawComm > 1 ? rawComm / 100 : rawComm;

  const rawTax = parseFloat(settingsMap["florida_tax_rate"] ?? "7");
  const taxRatePct = rawTax > 1 ? rawTax / 100 : rawTax;

  const rawCcFee = parseFloat(settingsMap["cc_fee_pct"] ?? "0");
  const ccFeePct = rawCcFee > 1 ? rawCcFee / 100 : rawCcFee;

  // ── Daily chart data (always last 30 days, unaffected by date filter) ────────
  const daily = await db
    .select({
      date: sql<string>`date(pickup_at)::text`,
      revenue: sql<number>`coalesce(sum(price_quoted::numeric) filter (where status = 'completed'), 0)::float`,
      bookings: sql<number>`count(*)::int`,
    })
    .from(bookingsTable)
    .where(start && end
      ? sql`pickup_at >= ${start.toISOString()} AND pickup_at < ${end.toISOString()}`
      : sql`pickup_at >= now() - interval '30 days'`)
    .groupBy(sql`date(pickup_at)`)
    .orderBy(sql`date(pickup_at)`);

  const byVehicleClass = await db
    .select({
      vehicleClass: bookingsTable.vehicleClass,
      revenue: sql<number>`coalesce(sum(price_quoted::numeric) filter (where ${completedFilter}), 0)::float`,
      bookings: sql<number>`count(*) filter (where ${completedFilter})::int`,
    })
    .from(bookingsTable)
    .groupBy(bookingsTable.vehicleClass);

  const [totals] = await db
    .select({
      totalRevenue: sql<number>`coalesce(sum(price_quoted::numeric) filter (where ${dateFilter}), 0)::float`,
      completedCount: sql<number>`count(*) filter (where ${dateFilter})::int`,
    })
    .from(bookingsTable);

  // ── Financial breakdown ───────────────────────────────────────────────────────
  // price_quoted = subtotal + taxes (gross charged to passenger, pre–CC fee).
  // Reverse-calculate components using the current rates for reporting purposes.
  const totalGrossIncome = totals?.totalRevenue ?? 0;
  // subtotal = grossIncome / (1 + taxRate)  →  taxes = grossIncome - subtotal
  const totalSubtotal = Math.round((totalGrossIncome / (1 + taxRatePct)) * 100) / 100;
  const totalTaxesCollected = Math.round((totalGrossIncome - totalSubtotal) * 100) / 100;
  const totalFeesCollected = Math.round(totalGrossIncome * ccFeePct * 100) / 100;
  const totalDriverCommissions = Math.round(totalSubtotal * commissionPct * 100) / 100;
  const companyNetIncome = Math.round(
    (totalGrossIncome - totalTaxesCollected - totalFeesCollected - totalDriverCommissions) * 100,
  ) / 100;

  // Legacy fields (kept for backward compat with existing hooks/components)
  const totalCommissionPaid = totalDriverCommissions;
  const totalCompanyRevenue = Math.round((totalGrossIncome - totalCommissionPaid) * 100) / 100;

  res.json(GetRevenueStatsResponse.parse({
    daily,
    byVehicleClass,
    totalRevenue: totalGrossIncome,
    totalCommissionPaid,
    totalCompanyRevenue,
    commissionPct,
    completedRides: totals?.completedCount ?? 0,
    // New financial breakdown fields
    totalGrossIncome,
    totalTaxesCollected,
    totalFeesCollected,
    totalDriverCommissions,
    companyNetIncome,
    taxRatePct,
    ccFeePct,
  }));
});

router.post("/admin/email/test-send", requireAdmin, async (req, res): Promise<void> => {
  const { to } = req.body as { to?: string };
  if (!to || !to.includes("@")) {
    res.status(400).json({ error: "Valid 'to' email address required" });
    return;
  }
  const { getMailerStatus } = await import("../lib/mailer.js");
  const status = getMailerStatus();
  if (!status.configured) {
    res.status(503).json({ error: "No email provider configured (set RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS)" });
    return;
  }
  const { sendBookingConfirmationPassenger } = await import("../lib/mailer.js");
  await sendBookingConfirmationPassenger({
    id: 0,
    passengerName: "Test Passenger",
    passengerEmail: to,
    pickupAddress: "Fort Lauderdale–Hollywood International Airport (FLL)",
    dropoffAddress: "1 Hotel South Beach, Miami Beach",
    pickupAt: new Date(Date.now() + 86400000).toISOString(),
    vehicleClass: "business",
    passengers: 2,
    priceQuoted: 149.0,
    flightNumber: "AA1234",
    specialRequests: "This is a test email from Royal Midnight.",
  });
  res.json({ success: true, provider: status.provider, message: `Test email sent via ${status.provider} to ${to}` });
});

router.get("/admin/email-logs", requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "50", 10), 200);
  const logs = await db
    .select()
    .from(emailLogsTable)
    .orderBy(desc(emailLogsTable.sentAt))
    .limit(limit);
  res.json(logs.map(l => ({ ...l, sentAt: l.sentAt.toISOString() })));
});

router.get("/admin/dispatch", requireAdmin, async (_req, res): Promise<void> => {
  const [activeTripsRaw, availableDriversRaw, pendingRaw] = await Promise.all([
    db.select().from(bookingsTable).where(sql`status IN ('on_way','on_location','in_progress')`),
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

// POST /admin/bookings/:id/link-user — manually link a booking to a user account
router.post("/admin/bookings/:id/link-user", requireAdmin, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params["id"] ?? "", 10);
  const { userId } = req.body as { userId?: number };
  if (isNaN(bookingId) || !userId) {
    res.status(400).json({ error: "bookingId and userId are required" });
    return;
  }
  const [user] = await db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
    .from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [updated] = await db
    .update(bookingsTable)
    .set({ userId: user.id, updatedAt: new Date() })
    .where(eq(bookingsTable.id, bookingId))
    .returning({ id: bookingsTable.id, userId: bookingsTable.userId });

  if (!updated) { res.status(404).json({ error: "Booking not found" }); return; }
  res.json({ ok: true, bookingId, linkedUserId: user.id, userEmail: user.email, userName: user.name });
});

// GET /admin/payouts/weekly — weekly earnings per driver
router.get("/admin/payouts/weekly", requireAdmin, async (req, res): Promise<void> => {
  // Parse week start (Monday) — default to current week's Monday
  let weekStart: Date;
  if (req.query["week"] && typeof req.query["week"] === "string") {
    weekStart = new Date(req.query["week"]);
  } else {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const diff = day === 0 ? -6 : 1 - day;
    weekStart = new Date(now);
    weekStart.setDate(now.getDate() + diff);
  }
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  // Get commission rate
  const [commRow] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "driver_commission_pct"));
  const rawPct = parseFloat(commRow?.value ?? "70");
  const commissionPct = rawPct > 1 ? rawPct / 100 : rawPct;

  // Get all approved drivers
  const drivers = await db
    .select()
    .from(driversTable)
    .where(sql`approval_status = 'approved'`)
    .orderBy(driversTable.name);

  // Get completed bookings in this week
  const bookings = await db
    .select({
      driverId: bookingsTable.driverId,
      priceQuoted: bookingsTable.priceQuoted,
    })
    .from(bookingsTable)
    .where(
      sql`status = 'completed' AND driver_id IS NOT NULL AND pickup_at >= ${weekStart.toISOString()} AND pickup_at < ${weekEnd.toISOString()}`
    );

  // Aggregate per driver
  const earningsByDriver = new Map<number, { rides: number; gross: number }>();
  for (const b of bookings) {
    if (!b.driverId) continue;
    const existing = earningsByDriver.get(b.driverId) ?? { rides: 0, gross: 0 };
    earningsByDriver.set(b.driverId, {
      rides: existing.rides + 1,
      gross: existing.gross + parseFloat(b.priceQuoted ?? "0"),
    });
  }

  const payouts = drivers.map(d => {
    const earnings = earningsByDriver.get(d.id) ?? { rides: 0, gross: 0 };
    const driverNet = Math.round(earnings.gross * commissionPct * 100) / 100;
    return {
      driverId: d.id,
      driverName: d.name,
      driverEmail: d.email,
      driverPhone: d.phone,
      rides: earnings.rides,
      grossEarnings: Math.round(earnings.gross * 100) / 100,
      commissionPct,
      driverNet,
      bankName: d.payoutBankName ?? null,
      routingNumber: d.payoutRoutingNumber ?? null,
      accountNumber: d.payoutAccountNumber ?? null,
      legalName: d.payoutLegalName ?? null,
      payoutEmail: d.payoutEmail ?? d.email,
      hasBankDetails: !!(d.payoutBankName && d.payoutRoutingNumber && d.payoutAccountNumber),
    };
  });

  res.json({
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    commissionPct,
    payouts,
    totalGross: Math.round(payouts.reduce((s, p) => s + p.grossEarnings, 0) * 100) / 100,
    totalDriverNet: Math.round(payouts.reduce((s, p) => s + p.driverNet, 0) * 100) / 100,
  });
});

// POST /admin/payouts/send-weekly — send weekly payout emails to all drivers + admin
router.post("/admin/payouts/send-weekly", requireAdmin, async (req, res): Promise<void> => {
  const { weekStart: weekStartStr } = req.body as { weekStart?: string };

  let weekStart: Date;
  if (weekStartStr) {
    weekStart = new Date(weekStartStr);
  } else {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    weekStart = new Date(now);
    weekStart.setDate(now.getDate() + diff);
  }
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const [commRow] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "driver_commission_pct"));
  const rawPct = parseFloat(commRow?.value ?? "70");
  const commissionPct = rawPct > 1 ? rawPct / 100 : rawPct;

  const drivers = await db
    .select()
    .from(driversTable)
    .where(sql`approval_status = 'approved'`)
    .orderBy(driversTable.name);

  const bookings = await db
    .select({ driverId: bookingsTable.driverId, priceQuoted: bookingsTable.priceQuoted })
    .from(bookingsTable)
    .where(sql`status = 'completed' AND driver_id IS NOT NULL AND pickup_at >= ${weekStart.toISOString()} AND pickup_at < ${weekEnd.toISOString()}`);

  const earningsByDriver = new Map<number, { rides: number; gross: number }>();
  for (const b of bookings) {
    if (!b.driverId) continue;
    const existing = earningsByDriver.get(b.driverId) ?? { rides: 0, gross: 0 };
    earningsByDriver.set(b.driverId, { rides: existing.rides + 1, gross: existing.gross + parseFloat(b.priceQuoted ?? "0") });
  }

  const { sendWeeklyDriverPayout, sendWeeklyPayoutAdminReport } = await import("../lib/mailer.js");
  const weekLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " – " + new Date(weekEnd.getTime() - 1).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const payouts = drivers.map(d => {
    const earnings = earningsByDriver.get(d.id) ?? { rides: 0, gross: 0 };
    const driverNet = Math.round(earnings.gross * commissionPct * 100) / 100;
    return {
      driverId: d.id, driverName: d.name, driverEmail: d.payoutEmail ?? d.email,
      rides: earnings.rides, grossEarnings: Math.round(earnings.gross * 100) / 100,
      commissionPct, driverNet,
      bankName: d.payoutBankName ?? null, routingNumber: d.payoutRoutingNumber ?? null,
      accountNumber: d.payoutAccountNumber ?? null, legalName: d.payoutLegalName ?? null,
    };
  });

  let emailsSent = 0;
  for (const p of payouts) {
    try {
      await sendWeeklyDriverPayout({ ...p, weekLabel });
      emailsSent++;
    } catch {}
  }

  try {
    await sendWeeklyPayoutAdminReport({
      weekLabel,
      payouts,
      totalGross: Math.round(payouts.reduce((s, p) => s + p.grossEarnings, 0) * 100) / 100,
      totalDriverNet: Math.round(payouts.reduce((s, p) => s + p.driverNet, 0) * 100) / 100,
      commissionPct,
    });
  } catch {}

  res.json({ ok: true, emailsSent, driverCount: drivers.length, weekLabel });
});

// PATCH /admin/drivers/:id/bank — update driver bank details
router.patch("/admin/drivers/:id/bank", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid driver ID" }); return; }
  const { bankName, routingNumber, accountNumber, legalName, payoutEmail } = req.body as {
    bankName?: string; routingNumber?: string; accountNumber?: string; legalName?: string; payoutEmail?: string;
  };
  const [updated] = await db
    .update(driversTable)
    .set({
      payoutBankName: bankName ?? null,
      payoutRoutingNumber: routingNumber ?? null,
      payoutAccountNumber: accountNumber ?? null,
      payoutLegalName: legalName ?? null,
      payoutEmail: payoutEmail ?? null,
    })
    .where(eq(driversTable.id, id))
    .returning({ id: driversTable.id });
  if (!updated) { res.status(404).json({ error: "Driver not found" }); return; }
  res.json({ ok: true, driverId: id });
});

// ─── Vehicle Catalog ────────────────────────────────────────────────────────

// GET /admin/vehicle-catalog
router.get("/admin/vehicle-catalog", requireAdmin, async (_req, res): Promise<void> => {
  const entries = await db.select().from(vehicleCatalogTable).orderBy(vehicleCatalogTable.make, vehicleCatalogTable.model);
  res.json(entries);
});

// POST /admin/vehicle-catalog
router.post("/admin/vehicle-catalog", requireAdmin, async (req, res): Promise<void> => {
  const { make, model, minYear, vehicleTypes, notes } = req.body as {
    make?: string; model?: string; minYear?: number; vehicleTypes?: string[]; notes?: string;
  };
  if (!make || !model || !minYear || !vehicleTypes?.length) {
    res.status(400).json({ error: "make, model, minYear, and at least one vehicleType are required" });
    return;
  }
  const [entry] = await db.insert(vehicleCatalogTable).values({
    make: make.trim(),
    model: model.trim(),
    minYear: Number(minYear),
    vehicleTypes: vehicleTypes.join(","),
    notes: notes?.trim() || null,
    isActive: true,
  }).returning();
  res.status(201).json(entry);
});

// PATCH /admin/vehicle-catalog/:id/toggle
router.patch("/admin/vehicle-catalog/:id/toggle", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [entry] = await db.select().from(vehicleCatalogTable).where(eq(vehicleCatalogTable.id, id));
  if (!entry) { res.status(404).json({ error: "Not found" }); return; }
  const [updated] = await db.update(vehicleCatalogTable).set({ isActive: !entry.isActive }).where(eq(vehicleCatalogTable.id, id)).returning();
  res.json(updated);
});

// DELETE /admin/vehicle-catalog/:id
router.delete("/admin/vehicle-catalog/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(vehicleCatalogTable).where(eq(vehicleCatalogTable.id, id));
  res.json({ ok: true });
});

// ─── Mailer ──────────────────────────────────────────────────────────────────

// GET /admin/mailer-status — check which email provider is active
router.get("/admin/mailer-status", requireAdmin, (_req, res) => {
  res.json(getMailerStatus());
});

// POST /admin/test-email — send a test email to verify Resend is working
router.post("/admin/test-email", requireAdmin, async (req, res): Promise<void> => {
  const to = (req.body as { to?: string }).to ?? ADMIN_EMAIL;
  const status = getMailerStatus();
  if (!status.configured) {
    res.status(503).json({ error: "No email provider configured. Set RESEND_API_KEY." });
    return;
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromAddr = process.env.SMTP_FROM ?? "Royal Midnight <noreply@royalmidnight.com>";
    const result = await resend.emails.send({
      from: fromAddr,
      to: [to],
      subject: "Royal Midnight — Email Test",
      html: `<!DOCTYPE html><html><body style="font-family:Georgia,serif;background:#050505;color:#e8e0d0;padding:32px">
        <h2 style="color:#c9a84c">Email delivery is working!</h2>
        <p>Your Resend integration is correctly configured for <strong>Royal Midnight</strong>.</p>
        <p style="color:#888;font-size:12px">Sent from: ${fromAddr}</p>
      </body></html>`,
    });
    res.json({ ok: true, provider: "resend", id: result.data?.id });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Fleet Compliance ─────────────────────────────────────────────────────────

/**
 * GET /admin/compliance
 * Returns drivers whose license, registration, or insurance is expiring within
 * the next 30 days (or is already past).  All date fields are stored as TEXT
 * in YYYY-MM-DD format.
 */
router.get("/admin/compliance", requireAdmin, async (_req, res): Promise<void> => {
  const drivers = await db.select({
    id: driversTable.id,
    name: driversTable.name,
    email: driversTable.email,
    phone: driversTable.phone,
    approvalStatus: driversTable.approvalStatus,
    licenseExpiry: driversTable.licenseExpiry,
    regExpiry: driversTable.regExpiry,
    insuranceExpiry: driversTable.insuranceExpiry,
  }).from(driversTable);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const threshold = new Date(today);
  threshold.setDate(threshold.getDate() + 30);

  type Alert = { driverId: number; driverName: string; driverEmail: string; type: string; expiry: string; daysRemaining: number; };
  const alerts: Alert[] = [];

  for (const d of drivers) {
    const checks: Array<{ label: string; val: string | null | undefined }> = [
      { label: "Driver License",    val: d.licenseExpiry },
      { label: "Vehicle Registration", val: d.regExpiry },
      { label: "Insurance",        val: d.insuranceExpiry },
    ];
    for (const { label, val } of checks) {
      if (!val) continue;
      const expiry = new Date(val);
      if (isNaN(expiry.getTime())) continue;
      const daysRemaining = Math.floor((expiry.getTime() - today.getTime()) / 86_400_000);
      if (daysRemaining <= 30) {
        alerts.push({
          driverId: d.id,
          driverName: d.name,
          driverEmail: d.email,
          type: label,
          expiry: val,
          daysRemaining,
        });
      }
    }
  }

  // Sort: most urgent first
  alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
  res.json(alerts);
});

export default router;
