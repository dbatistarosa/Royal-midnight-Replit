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
    // bookings: scheduling / auth columns
    await client.query(`
      ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ
    `);

    // users: Stripe customer + saved payment method (passenger features)
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
        ADD COLUMN IF NOT EXISTS default_payment_method_id TEXT
    `);

    // users: cabin preference center (Phase 1 — shown to chauffeur on trip manifest)
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS cabin_temp_f INTEGER,
        ADD COLUMN IF NOT EXISTS music_preference TEXT,
        ADD COLUMN IF NOT EXISTS quiet_ride BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS preferred_beverage TEXT,
        ADD COLUMN IF NOT EXISTS opens_own_door BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS address_title TEXT
    `);

    // bookings: tip support (passenger features)
    await client.query(`
      ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(10, 2),
        ADD COLUMN IF NOT EXISTS tip_payment_intent_id TEXT
    `);

    // bookings: route estimates for driver conflict detection
    await client.query(`
      ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER,
        ADD COLUMN IF NOT EXISTS estimated_distance_miles NUMERIC(6, 2)
    `);

    // users: VIP notes (admin-only, shown read-only to driver — Phase 2)
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS vip_notes TEXT
    `);

    // bookings: pre-ride checklist + preferred driver (Phase 2)
    await client.query(`
      ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS checklist_completed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS preferred_driver_id INTEGER
    `);

    // Favorite drivers junction table (Phase 2)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_favorite_drivers (
        user_id   INTEGER NOT NULL,
        driver_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, driver_id)
      )
    `);

    // bookings: multi-stop itinerary + charter mode + delegate booking (Phase 3)
    await client.query(`
      ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS waypoints TEXT,
        ADD COLUMN IF NOT EXISTS charter_mode TEXT,
        ADD COLUMN IF NOT EXISTS charter_hours INTEGER,
        ADD COLUMN IF NOT EXISTS booked_by_user_id INTEGER
    `);

    // Geofenced pricing zones table (Phase 3 — item 14)
    await client.query(`
      CREATE TABLE IF NOT EXISTS geo_zones (
        id             SERIAL PRIMARY KEY,
        name           TEXT NOT NULL,
        description    TEXT,
        type           TEXT NOT NULL DEFAULT 'circle',
        geometry       TEXT NOT NULL,
        rate_multiplier REAL NOT NULL DEFAULT 1.0,
        is_active      BOOLEAN NOT NULL DEFAULT TRUE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Delegate / EA managed travelers junction table (Phase 3 — item 15)
    await client.query(`
      CREATE TABLE IF NOT EXISTS managed_travelers (
        ea_user_id     INTEGER NOT NULL,
        traveler_id    INTEGER NOT NULL,
        traveler_name  TEXT,
        traveler_email TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (ea_user_id, traveler_id)
      )
    `);

    // Backfill drivers.total_rides from completed bookings (full reconciliation — runs on every boot)
    await client.query(`
      UPDATE drivers d
      SET total_rides = coalesce(sub.cnt, 0)
      FROM (
        SELECT dr.id AS driver_id, count(b.id)::int AS cnt
        FROM drivers dr
        LEFT JOIN bookings b ON b.driver_id = dr.id AND b.status = 'completed'
        GROUP BY dr.id
      ) sub
      WHERE d.id = sub.driver_id
        AND d.total_rides IS DISTINCT FROM coalesce(sub.cnt, 0)
    `);

    // ── Driver record deduplication (runs on every boot, idempotent) ──────────
    //
    // A driver may have two records: one admin-created (possibly no user_id, has bookings)
    // and one onboarding-created (has user_id, no bookings). We need to ensure the record
    // returned by /drivers/by-user has the bookings on it.
    //
    // Strategy A: Email-based — when two records share the same email (unique constraint
    //   may not be enforced on older deployments), consolidate by booking count.
    // Strategy B: Name-based — when same-named driver has a user_id=NULL record with
    //   bookings AND a user_id-linked record with 0 bookings, transfer the user_id to
    //   the record with bookings so by-user always returns the right one.

    // Step 1 (email-based): Reassign bookings from non-canonical to canonical per email
    await client.query(`
      WITH booking_counts AS (
        SELECT d.id, d.email, COUNT(b.id)::int AS cnt
        FROM drivers d
        LEFT JOIN bookings b ON b.driver_id = d.id AND b.status = 'completed'
        WHERE d.email IS NOT NULL AND d.email <> ''
        GROUP BY d.id, d.email
      ),
      email_canonical AS (
        SELECT DISTINCT ON (email) id AS canonical_id, email
        FROM booking_counts
        ORDER BY email, cnt DESC, id ASC
      ),
      dup_map AS (
        SELECT bc.id AS old_id, ec.canonical_id
        FROM booking_counts bc
        JOIN email_canonical ec ON ec.email = bc.email
        WHERE bc.id <> ec.canonical_id
      )
      UPDATE bookings bk
      SET driver_id = dm.canonical_id
      FROM dup_map dm
      WHERE bk.driver_id = dm.old_id
    `);

    // Step 2 (email-based): Copy user_id from any same-email sibling onto the canonical
    await client.query(`
      WITH booking_counts AS (
        SELECT d.id, d.email, COUNT(b.id)::int AS cnt
        FROM drivers d
        LEFT JOIN bookings b ON b.driver_id = d.id AND b.status = 'completed'
        WHERE d.email IS NOT NULL AND d.email <> ''
        GROUP BY d.id, d.email
      ),
      email_canonical AS (
        SELECT DISTINCT ON (email) id AS canonical_id, email
        FROM booking_counts
        ORDER BY email, cnt DESC, id ASC
      )
      UPDATE drivers d
      SET user_id = (
        SELECT d2.user_id
        FROM drivers d2
        WHERE d2.email = d.email AND d2.user_id IS NOT NULL
        ORDER BY d2.total_rides DESC
        LIMIT 1
      )
      FROM email_canonical ec
      WHERE d.id = ec.canonical_id
        AND d.user_id IS NULL
        AND EXISTS (
          SELECT 1 FROM drivers d3 WHERE d3.email = d.email AND d3.user_id IS NOT NULL
        )
    `);

    // Step 3 (email-based): Null out user_id on non-canonical same-email records
    await client.query(`
      WITH booking_counts AS (
        SELECT d.id, d.email, COUNT(b.id)::int AS cnt
        FROM drivers d
        LEFT JOIN bookings b ON b.driver_id = d.id AND b.status = 'completed'
        WHERE d.email IS NOT NULL AND d.email <> ''
        GROUP BY d.id, d.email
      ),
      email_canonical AS (
        SELECT DISTINCT ON (email) id AS canonical_id, email
        FROM booking_counts
        ORDER BY email, cnt DESC, id ASC
      )
      UPDATE drivers d
      SET user_id = NULL
      FROM booking_counts bc
      JOIN email_canonical ec ON ec.email = bc.email
      WHERE d.id = bc.id
        AND bc.id <> ec.canonical_id
        AND d.user_id IS NOT NULL
    `);

    // Step 4 (name-based fallback): Handle the case where an admin created a driver
    // record (different email, no user_id) but a user also registered as a driver
    // under the same name via onboarding (has user_id, 0 rides).
    // Transfer the user_id from the 0-ride onboarding record to the record with bookings,
    // then null out the onboarding record's user_id so by-user returns the right record.
    //
    // Safety: only acts when EXACTLY ONE name-matching admin record exists (prevents
    // accidental merges for drivers who happen to share the same name).
    await client.query(`
      WITH onboarding_records AS (
        -- Driver records linked to a user account but with no completed bookings
        SELECT d.id AS onboarding_id, d.name, d.user_id
        FROM drivers d
        WHERE d.user_id IS NOT NULL
          AND (SELECT COUNT(*) FROM bookings b WHERE b.driver_id = d.id AND b.status = 'completed') = 0
      ),
      admin_records AS (
        -- Driver records with no user_id but with completed bookings
        SELECT d.id AS admin_id, d.name,
               COUNT(*) OVER (PARTITION BY d.name) AS name_match_count
        FROM drivers d
        WHERE d.user_id IS NULL
          AND (SELECT COUNT(*) FROM bookings b WHERE b.driver_id = d.id AND b.status = 'completed') > 0
      ),
      transfer_pairs AS (
        SELECT o.onboarding_id, o.user_id AS the_user_id, a.admin_id
        FROM onboarding_records o
        JOIN admin_records a ON a.name = o.name AND a.name_match_count = 1
      )
      UPDATE drivers d
      SET user_id = tp.the_user_id
      FROM transfer_pairs tp
      WHERE d.id = tp.admin_id
        AND d.user_id IS NULL
    `);

    // null out user_id on onboarding records that were matched above
    await client.query(`
      WITH onboarding_records AS (
        SELECT d.id AS onboarding_id, d.name, d.user_id
        FROM drivers d
        WHERE d.user_id IS NOT NULL
          AND (SELECT COUNT(*) FROM bookings b WHERE b.driver_id = d.id AND b.status = 'completed') = 0
      ),
      admin_records AS (
        SELECT d.id AS admin_id, d.name,
               COUNT(*) OVER (PARTITION BY d.name) AS name_match_count
        FROM drivers d
        WHERE d.user_id IS NULL
          AND (SELECT COUNT(*) FROM bookings b WHERE b.driver_id = d.id AND b.status = 'completed') > 0
      ),
      transfer_pairs AS (
        SELECT o.onboarding_id
        FROM onboarding_records o
        JOIN admin_records a ON a.name = o.name AND a.name_match_count = 1
      )
      UPDATE drivers d
      SET user_id = NULL
      FROM transfer_pairs tp
      WHERE d.id = tp.onboarding_id
        AND d.user_id IS NOT NULL
    `);

    // Step 5: Refresh total_rides on ALL driver records after consolidation
    await client.query(`
      UPDATE drivers d
      SET total_rides = (
        SELECT COUNT(*)::int
        FROM bookings b
        WHERE b.driver_id = d.id AND b.status = 'completed'
      )
    `);

    // Compliance: compliance_hold column on drivers
    await client.query(`
      ALTER TABLE drivers
        ADD COLUMN IF NOT EXISTS compliance_hold BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // Compliance documents table — one row per driver per document submission
    await client.query(`
      CREATE TABLE IF NOT EXISTS compliance_documents (
        id            SERIAL PRIMARY KEY,
        driver_id     INTEGER NOT NULL REFERENCES drivers(id),
        doc_type      TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'pending_review',
        file_url      TEXT NOT NULL,
        new_expiry    TEXT,
        admin_notes   TEXT,
        reviewed_at   TIMESTAMPTZ,
        submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Row-Level Security — enable on every table and create a permissive PUBLIC
    // policy so all database roles (including Replit's production role) retain
    // full access. RLS is a guard rail against future role-scoped restrictions.
    await client.query(`
      DO $$
      DECLARE
        tbl    TEXT;
        tables TEXT[] := ARRAY[
          'users', 'drivers', 'bookings', 'vehicles', 'saved_addresses',
          'reviews', 'support_tickets', 'ticket_messages', 'notifications',
          'promo_codes', 'pricing_rules', 'settings', 'sessions',
          'password_reset_tokens', 'email_logs', 'vehicle_catalog', 'otp_codes',
          'user_favorite_drivers', 'geo_zones', 'managed_travelers',
          'compliance_documents'
        ];
      BEGIN
        FOREACH tbl IN ARRAY tables LOOP
          -- Enable RLS on the table (idempotent)
          EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

          -- Create a permissive full-access policy for all roles if absent.
          -- Using PUBLIC avoids hard-coding a role name that may differ across environments.
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename  = tbl
              AND policyname = 'app_full_access'
          ) THEN
            EXECUTE format(
              'CREATE POLICY app_full_access ON %I AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true)',
              tbl
            );
          END IF;
        END LOOP;
      END $$
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

    const { driversTable, bookingsTable: bookTbl } = await import("@workspace/db");
    const { sendTripReminderPassenger, sendTripReminderDriver } = await import("./lib/mailer.js");

    const { fetchCommissionPct: fetchCommPct } = await import("./lib/commission.js");
    const commissionPct = await fetchCommPct();

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
          `SELECT id, passenger_name, passenger_email, passenger_phone, pickup_address, dropoff_address,
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

        // SMS chauffeur intro — non-fatal (does not affect reminder_sent_at stamp)
        const { sendChauffeurIntroSms } = await import("./lib/sms.js");
        const bookingRef = `RM-${String(row.id).padStart(4, "0")}`;
        sendChauffeurIntroSms(
          row.passenger_phone ?? null,
          driver.name,
          bookingRef,
          new Date(row.pickup_at).toISOString(),
        ).catch((smsErr: unknown) => logger.warn({ smsErr, bookingId: row.id }, "Chauffeur intro SMS failed (non-fatal)"));

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
    const { driversTable, bookingsTable: bookTbl } = await import("@workspace/db");
    const { sql: sqlFn } = await import("drizzle-orm");

    const { fetchCommissionPct: fetchCommPct2 } = await import("./lib/commission.js");
    const commissionPct = await fetchCommPct2();

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
      try {
        await sendWeeklyDriverPayout(p);
      } catch (err) {
        logger.error({ err, driverId: p.driverId }, "Failed to send weekly payout email to driver");
      }
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

/**
 * Compliance enforcement — runs every minute, meaningful work only at midnight.
 * For each driver with an expired document (today > expiry) that has no approved
 * pending renewal:
 *   1. Sets compliance_hold = true
 *   2. Unassigns all future bookings for that driver → status 'pending'
 *   3. Sends a high-priority admin alert email
 */
async function runComplianceEnforcement(): Promise<void> {
  try {
    const now = new Date();
    // Only run in the 00:00–00:05 window to avoid repeated triggers
    if (now.getHours() !== 0 || now.getMinutes() > 5) return;

    const { driversTable: dTbl, bookingsTable: bTbl, complianceDocumentsTable } = await import("@workspace/db");
    const { eq: eqOp, and: andOp, gt, isNull, or } = await import("drizzle-orm");
    const { sendComplianceLockoutAdmin } = await import("./lib/mailer.js");

    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    const drivers = await db.select({
      id: dTbl.id,
      name: dTbl.name,
      email: dTbl.email,
      complianceHold: dTbl.complianceHold,
      licenseExpiry: dTbl.licenseExpiry,
      regExpiry: dTbl.regExpiry,
      insuranceExpiry: dTbl.insuranceExpiry,
    }).from(dTbl);

    for (const driver of drivers) {
      // Determine which docs (if any) are expired as of today
      const docChecks: Array<{ label: string; expiry: string | null | undefined }> = [
        { label: "Driver License", expiry: driver.licenseExpiry },
        { label: "Vehicle Registration", expiry: driver.regExpiry },
        { label: "Insurance", expiry: driver.insuranceExpiry },
      ];

      for (const { label, expiry } of docChecks) {
        if (!expiry || expiry > todayStr) continue; // not expired

        // Check if there's an approved pending submission
        const [approved] = await db.select({ id: complianceDocumentsTable.id })
          .from(complianceDocumentsTable)
          .where(andOp(
            eqOp(complianceDocumentsTable.driverId, driver.id),
            eqOp(complianceDocumentsTable.docType, label),
            eqOp(complianceDocumentsTable.status, "approved"),
          ))
          .limit(1);

        if (approved) continue; // renewed — don't lock

        if (!driver.complianceHold) {
          // Lock the driver
          await db.update(dTbl).set({ complianceHold: true }).where(eqOp(dTbl.id, driver.id));
          logger.info({ driverId: driver.id, docType: label }, "Driver placed on compliance_hold");

          // Unassign all future bookings
          const futureBookings = await db.select({ id: bTbl.id })
            .from(bTbl)
            .where(andOp(
              eqOp(bTbl.driverId, driver.id),
              gt(bTbl.pickupAt, now),
              or(
                eqOp(bTbl.status, "confirmed"),
                eqOp(bTbl.status, "pending"),
              ),
            ));

          if (futureBookings.length > 0) {
            await db.update(bTbl)
              .set({ driverId: null, status: "pending", updatedAt: new Date() })
              .where(andOp(
                eqOp(bTbl.driverId, driver.id),
                gt(bTbl.pickupAt, now),
                or(eqOp(bTbl.status, "confirmed"), eqOp(bTbl.status, "pending")),
              ));
          }

          // Notify admin
          try {
            await sendComplianceLockoutAdmin({
              driverName: driver.name,
              driverEmail: driver.email,
              docType: label,
              expiryDate: expiry,
              ridesUnassigned: futureBookings.length,
            });
          } catch (emailErr) {
            logger.error({ emailErr, driverId: driver.id }, "Failed to send compliance lockout admin alert (non-fatal)");
          }
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Compliance enforcement error (non-fatal)");
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

    // Compliance enforcement — runs every minute, triggers at midnight
    void runComplianceEnforcement();
    setInterval(() => void runComplianceEnforcement(), 60 * 1000);
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
