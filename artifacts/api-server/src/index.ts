import { eq, and, isNull } from "drizzle-orm";
import { db, pool, usersTable, settingsTable, bookingsTable } from "@workspace/db";
import Stripe from "stripe";
import app from "./app";
import { logger } from "./lib/logger";
import { hashPassword, isValidHash } from "./lib/hash.js";
import { safeDecryptField } from "./lib/encrypt.js";
import { readFileSync, readdirSync, readlinkSync } from "fs";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Apply any missing schema columns that were added in recent releases.
// Using IF NOT EXISTS makes each statement safe to run on every startup.
async function runStartupMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ
    `);
  } finally {
    client.release();
  }
}

async function seedDatabase(): Promise<void> {
  try {
    const adminEmail = "admin@royalmidnight.com";
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, adminEmail));

    if (!existing) {
      const seedPassword = process.env.ADMIN_SEED_PASSWORD;
      if (!seedPassword) {
        logger.warn("ADMIN_SEED_PASSWORD is not set — using default seed password. Set this env var in production.");
      }
      await db.insert(usersTable).values({
        name: "Royal Midnight Admin",
        email: adminEmail,
        phone: null,
        role: "admin",
        passwordHash: await hashPassword(seedPassword || "admin2024!"),
      });
      logger.info("Admin user seeded successfully");
    } else {
      logger.info("Admin user already exists — skipping seed");
    }

    const allUsers = await db.select().from(usersTable);
    for (const user of allUsers) {
      if (user.passwordHash && !isValidHash(user.passwordHash)) {
        const fixedHash = await hashPassword(user.passwordHash);
        await db
          .update(usersTable)
          .set({ passwordHash: fixedHash })
          .where(eq(usersTable.id, user.id));
        logger.info({ email: user.email }, "Fixed corrupted password hash");
      }
    }
  } catch (err) {
    logger.error({ err }, "Database seed failed");
  }
}

async function ensureStripeWebhook(): Promise<void> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    logger.warn("STRIPE_SECRET_KEY not set — skipping webhook check");
    return;
  }

  // Default to production URL when APP_URL is not explicitly set
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const expectedUrl = `${appUrl}/api/webhook/stripe`;

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" as const });
    const existing = await stripe.webhookEndpoints.list({ limit: 20 });
    const found = existing.data.find(w => w.url === expectedUrl && w.status === "enabled");

    const REQUIRED_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
      "payment_intent.succeeded",
      "payment_intent.payment_failed",
      "charge.dispute.created",
      "charge.refunded",
      "invoice.paid",
    ];

    if (found) {
      const currentEvents = found.enabled_events ?? [];
      const missingEvents = REQUIRED_EVENTS.filter(e => !currentEvents.includes(e));
      if (missingEvents.length > 0) {
        await stripe.webhookEndpoints.update(found.id, {
          enabled_events: REQUIRED_EVENTS,
        });
        logger.info({ webhookId: found.id, added: missingEvents }, "Stripe webhook updated with new events");
      } else {
        logger.info({ webhookId: found.id, url: expectedUrl }, "Stripe webhook already registered");
      }
      return;
    }

    const webhook = await stripe.webhookEndpoints.create({
      url: expectedUrl,
      enabled_events: REQUIRED_EVENTS,
      description: "Royal Midnight payment confirmation webhook",
    });

    // Persist signing secret to DB so webhook handler can use it without env var
    if (webhook.secret) {
      await db
        .insert(settingsTable)
        .values({ key: "stripe_webhook_secret", value: webhook.secret })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value: webhook.secret } });
      logger.info({ webhookId: webhook.id, url: expectedUrl }, "Stripe webhook auto-registered — signing secret saved to DB. Set STRIPE_WEBHOOK_SECRET in env for best security.");
    }
  } catch (err) {
    logger.error({ err }, "Stripe webhook ensure failed (non-fatal)");
  }
}

// Link all unlinked bookings (userId IS NULL) to matching user accounts by passengerEmail.
// Runs once at startup so historical admin-created bookings are retroactively associated.
async function retroactiveEmailLink(): Promise<void> {
  try {
    const users = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable);
    let linked = 0;
    for (const user of users) {
      const result = await db
        .update(bookingsTable)
        .set({ userId: user.id })
        .where(and(eq(bookingsTable.passengerEmail, user.email), isNull(bookingsTable.userId)))
        .returning({ id: bookingsTable.id });
      linked += result.length;
    }
    if (linked > 0) {
      logger.info({ linked }, "Retroactive email link: linked unlinked bookings to user accounts");
    }
  } catch (err) {
    logger.error({ err }, "Retroactive email link failed (non-fatal)");
  }
}

// Trip reminder scheduler — runs every minute, sends emails 55–65 min before pickup.
// Uses SELECT ... FOR UPDATE SKIP LOCKED inside a transaction to safely claim each
// booking row across concurrent scheduler runs or multiple API instances. The
// reminder_sent_at timestamp is only written after both emails are successfully sent,
// so a transient email failure is retried on the next scheduler tick (until the row
// falls outside the 55–65 min window).
async function sendTripReminders(): Promise<void> {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 55 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 65 * 60 * 1000);

    const { driversTable, bookingsTable: bookTbl, settingsTable: settTbl } = await import("@workspace/db");
    const { sendTripReminderPassenger, sendTripReminderDriver } = await import("./lib/mailer.js");

    const [commRow] = await db.select({ value: settTbl.value }).from(settTbl).where(eq(settTbl.key, "driver_commission_pct"));
    const rawPct = parseFloat(commRow?.value ?? "70");
    const commissionPct = rawPct > 1 ? rawPct / 100 : rawPct;

    // Find candidates outside the transaction first to avoid long-held locks
    const candidates = await db
      .select({ id: bookTbl.id })
      .from(bookTbl)
      .where(
        and(
          eq(bookTbl.status, "confirmed"),
          isNull(bookTbl.reminderSentAt),
        )
      );

    for (const { id } of candidates) {
      // Use a per-booking transaction with FOR UPDATE SKIP LOCKED to claim each row.
      // The lock is held for the entire send sequence — emails are sent while the
      // transaction is open, and reminder_sent_at is stamped inside the same transaction
      // before COMMIT. This guarantees: (a) only one instance processes each booking,
      // (b) the stamp only lands if both emails succeed, and (c) a failure leaves the
      // row unclaimed for the next scheduler tick.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(
          `SELECT id, passenger_name, passenger_email, pickup_address, dropoff_address,
                  pickup_at, vehicle_class, passengers, price_quoted, driver_id
           FROM bookings
           WHERE id = $1
             AND status = 'confirmed'
             AND driver_id IS NOT NULL
             AND pickup_at >= $2
             AND pickup_at <= $3
             AND reminder_sent_at IS NULL
           FOR UPDATE SKIP LOCKED`,
          [id, windowStart.toISOString(), windowEnd.toISOString()]
        );

        if (rows.length === 0) {
          await client.query("ROLLBACK");
          continue;
        }

        const row = rows[0] as any;

        // Fetch driver while holding the lock (read-only, does not block long)
        const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, row.driver_id));
        if (!driver) {
          await client.query("ROLLBACK");
          continue;
        }

        const priceQuoted = parseFloat(row.price_quoted ?? "0");
        const driverEarnings = Math.round(priceQuoted * commissionPct * 100) / 100;

        const reminderData = {
          id: row.id,
          passengerName: row.passenger_name,
          passengerEmail: row.passenger_email,
          pickupAddress: row.pickup_address,
          dropoffAddress: row.dropoff_address,
          pickupAt: new Date(row.pickup_at).toISOString(),
          vehicleClass: row.vehicle_class,
          passengers: row.passengers,
          priceQuoted,
          driverName: driver.name,
          driverPhone: driver.phone,
          driverEarnings,
        };

        // Send both emails — if either throws, the catch block rolls back and the row
        // remains unclaimed so the next scheduler tick retries.
        await sendTripReminderPassenger(reminderData);
        await sendTripReminderDriver(reminderData, driver.email);

        // Stamp reminder_sent_at inside the same transaction (commits atomically)
        await client.query(
          `UPDATE bookings SET reminder_sent_at = $1 WHERE id = $2`,
          [now.toISOString(), row.id]
        );
        await client.query("COMMIT");
        logger.info({ bookingId: row.id, passengerEmail: row.passenger_email }, "Trip reminder sent");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        logger.error({ err, bookingId: id }, "Failed to send trip reminder for booking (non-fatal)");
      } finally {
        client.release();
      }
    }
  } catch (err) {
    logger.error({ err }, "Trip reminder scheduler error (non-fatal)");
  }
}

// Weekly payout scheduler — fires every Monday at ~8am server time
async function runWeeklyPayoutIfNeeded(): Promise<void> {
  try {
    const now = new Date();
    if (now.getDay() !== 1) return; // Only Mondays
    if (now.getHours() < 8 || now.getHours() > 10) return; // 8–10am window

    // Check if we already sent the weekly report today
    const { emailLogsTable } = await import("@workspace/db");
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const { gte, and: andOp, eq: eqOp } = await import("drizzle-orm");
    const recent = await db.select({ id: emailLogsTable.id })
      .from(emailLogsTable)
      .where(andOp(eqOp(emailLogsTable.type, "weekly_payout_admin_report"), gte(emailLogsTable.sentAt, todayStart)))
      .limit(1);

    if (recent.length > 0) {
      logger.info("Weekly payout already sent today — skipping");
      return;
    }

    logger.info("Sending scheduled weekly payout emails...");
    const { driversTable, bookingsTable: bookTbl, settingsTable: settTbl } = await import("@workspace/db");
    const { sql: sqlFn } = await import("drizzle-orm");

    const [commRow] = await db.select({ value: settTbl.value }).from(settTbl).where(eqOp(settTbl.key, "driver_commission_pct"));
    const rawPct = parseFloat(commRow?.value ?? "70");
    const commissionPct = rawPct > 1 ? rawPct / 100 : rawPct;

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7); // Previous week
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(now); weekEnd.setHours(0, 0, 0, 0);
    const weekLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " – " + new Date(weekEnd.getTime() - 1).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    const drivers = await db.select().from(driversTable).where(sqlFn`approval_status = 'approved'`).orderBy(driversTable.name);
    const bookings = await db.select({ driverId: bookTbl.driverId, priceQuoted: bookTbl.priceQuoted })
      .from(bookTbl)
      .where(sqlFn`status = 'completed' AND driver_id IS NOT NULL AND pickup_at >= ${weekStart.toISOString()} AND pickup_at < ${weekEnd.toISOString()}`);

    const earningsByDriver = new Map<number, { rides: number; gross: number }>();
    for (const b of bookings) {
      if (!b.driverId) continue;
      const e = earningsByDriver.get(b.driverId) ?? { rides: 0, gross: 0 };
      earningsByDriver.set(b.driverId, { rides: e.rides + 1, gross: e.gross + parseFloat(b.priceQuoted ?? "0") });
    }

    const { sendWeeklyDriverPayout, sendWeeklyPayoutAdminReport } = await import("./lib/mailer.js");
    const payouts = drivers.map(d => {
      const e = earningsByDriver.get(d.id) ?? { rides: 0, gross: 0 };
      const driverNet = Math.round(e.gross * commissionPct * 100) / 100;
      return {
        driverId: d.id, driverName: d.name, driverEmail: d.payoutEmail ?? d.email,
        rides: e.rides, grossEarnings: Math.round(e.gross * 100) / 100,
        commissionPct, driverNet, weekLabel,
        bankName: d.payoutBankName ?? null, routingNumber: safeDecryptField(d.payoutRoutingNumber),
        accountNumber: safeDecryptField(d.payoutAccountNumber), legalName: d.payoutLegalName ?? null,
      };
    });

    for (const p of payouts) {
      try { await sendWeeklyDriverPayout(p); } catch (err) { logger.error({ err }, "Payout email failed"); }
    }
    await sendWeeklyPayoutAdminReport({
      weekLabel, payouts, commissionPct,
      totalGross: Math.round(payouts.reduce((s, p) => s + p.grossEarnings, 0) * 100) / 100,
      totalDriverNet: Math.round(payouts.reduce((s, p) => s + p.driverNet, 0) * 100) / 100,
    });
    logger.info({ driverCount: drivers.length, weekLabel }, "Weekly payout emails sent");
  } catch (err) {
    logger.error({ err }, "Weekly payout scheduler error (non-fatal)");
  }
}

// Kill any process currently holding a given TCP port using /proc/net/tcp{,6}.
// Node commonly binds on IPv6 (::) even for dual-stack sockets, so we check
// both files. Works on Linux without fuser/lsof — both absent from this container.
function killProcessOnPort(targetPort: number): void {
  try {
    const hexPort = targetPort.toString(16).padStart(4, "0").toUpperCase();
    let targetInode: string | null = null;

    // Check IPv4 and IPv6 proc files
    for (const procFile of ["/proc/net/tcp", "/proc/net/tcp6"]) {
      try {
        const content = readFileSync(procFile, "utf8");
        for (const line of content.split("\n").slice(1)) {
          const parts = line.trim().split(/\s+/);
          const localAddr = parts[1] ?? "";
          // IPv4:  "0100007F:1F40"  — port is after the single colon
          // IPv6:  "000...0001:1F40" — port is after the last colon
          const colonIdx = localAddr.lastIndexOf(":");
          const localPortHex = colonIdx >= 0 ? localAddr.slice(colonIdx + 1) : "";
          if (localPortHex.toUpperCase() === hexPort) {
            targetInode = parts[9] ?? null;
            break;
          }
        }
      } catch { /* file may not exist on some kernels */ }
      if (targetInode) break;
    }

    if (!targetInode) return;

    for (const pid of readdirSync("/proc").filter(d => /^\d+$/.test(d))) {
      try {
        for (const fd of readdirSync(`/proc/${pid}/fd`)) {
          try {
            const link = readlinkSync(`/proc/${pid}/fd/${fd}`);
            if (link === `socket:[${targetInode}]`) {
              process.kill(parseInt(pid, 10), "SIGTERM");
              logger.info({ pid, port: targetPort }, "Killed process holding port — will retry listen");
              return;
            }
          } catch { /* fd unreadable — process may have exited */ }
        }
      } catch { /* pid directory gone */ }
    }
  } catch (err) {
    logger.warn({ err }, "killProcessOnPort failed (non-fatal)");
  }
}

function startListening(attempt = 1): void {
  const server = app.listen(port);

  server.on("listening", () => {
    logger.info({ port }, "Server listening");

    // Run payout check immediately on startup, then every hour
    void runWeeklyPayoutIfNeeded();
    setInterval(() => void runWeeklyPayoutIfNeeded(), 60 * 60 * 1000);

    // Run trip reminder check immediately on startup, then every minute
    void sendTripReminders();
    setInterval(() => void sendTripReminders(), 60 * 1000);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attempt <= 2) {
      logger.warn({ port, attempt }, "Port in use — killing old process and retrying in 1s");
      killProcessOnPort(port);
      setTimeout(() => startListening(attempt + 1), 1000);
      return;
    }
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });
}

runStartupMigrations()
  .then(() => seedDatabase())
  .then(() => retroactiveEmailLink())
  .then(() => ensureStripeWebhook())
  .then(() => startListening());
