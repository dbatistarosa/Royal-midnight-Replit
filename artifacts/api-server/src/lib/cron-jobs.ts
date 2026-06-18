import { eq, and, gt, isNull, gte, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { logger } from "./logger";
import { safeDecryptField } from "./encrypt.js";

export async function sendTripReminders(): Promise<void> {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 55 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 65 * 60 * 1000);

    const { driversTable, bookingsTable } = await import("@workspace/db");
    const { sendTripReminderPassenger, sendTripReminderDriver } = await import("./mailer.js");
    const { sendChauffeurIntroSms } = await import("./sms.js");
    const { fetchCommissionPct } = await import("./commission.js");
    const commissionPct = await fetchCommissionPct();

    const candidates = await db
      .select({ id: bookingsTable.id })
      .from(bookingsTable)
      .where(and(eq(bookingsTable.status, "confirmed"), isNull(bookingsTable.reminderSentAt)));

    for (const { id } of candidates) {
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
          [id, windowStart.toISOString(), windowEnd.toISOString()],
        );

        if (rows.length === 0) { await client.query("ROLLBACK"); continue; }

        const row = rows[0] as Record<string, unknown>;
        const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, row.driver_id as number));
        if (!driver) { await client.query("ROLLBACK"); continue; }

        const priceQuoted = parseFloat(String(row.price_quoted ?? "0"));
        const driverEarnings = Math.round(priceQuoted * commissionPct * 100) / 100;

        const reminderData = {
          id: row.id as number,
          passengerName: row.passenger_name as string,
          passengerEmail: row.passenger_email as string,
          pickupAddress: row.pickup_address as string,
          dropoffAddress: row.dropoff_address as string,
          pickupAt: new Date(row.pickup_at as string).toISOString(),
          vehicleClass: row.vehicle_class as string,
          passengers: row.passengers as number,
          priceQuoted,
          driverName: driver.name,
          driverPhone: driver.phone,
          driverEarnings,
        };

        await sendTripReminderPassenger(reminderData);
        await sendTripReminderDriver(reminderData, driver.email);

        const bookingRef = `RM-${String(row.id).padStart(4, "0")}`;
        sendChauffeurIntroSms(
          (row.passenger_phone as string | null) ?? null,
          driver.name,
          bookingRef,
          new Date(row.pickup_at as string).toISOString(),
        ).catch((smsErr: unknown) => logger.warn({ smsErr, bookingId: row.id }, "Chauffeur intro SMS failed (non-fatal)"));

        await client.query(`UPDATE bookings SET reminder_sent_at = $1 WHERE id = $2`, [now.toISOString(), row.id]);
        await client.query("COMMIT");
        logger.info({ bookingId: row.id, passengerEmail: row.passenger_email }, "Trip reminder sent");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        logger.error({ err, bookingId: id }, "Failed to send trip reminder (non-fatal)");
      } finally {
        client.release();
      }
    }
  } catch (err) {
    logger.error({ err }, "Trip reminder scheduler error (non-fatal)");
  }
}

export async function runWeeklyPayoutIfNeeded(): Promise<void> {
  try {
    const now = new Date();
    if (now.getDay() !== 1) return;
    if (now.getHours() < 8 || now.getHours() > 10) return;

    const { emailLogsTable, driversTable, bookingsTable } = await import("@workspace/db");
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

    const recent = await db.select({ id: emailLogsTable.id })
      .from(emailLogsTable)
      .where(and(eq(emailLogsTable.type, "weekly_payout_admin_report"), gte(emailLogsTable.sentAt, todayStart)))
      .limit(1);

    if (recent.length > 0) { logger.info("Weekly payout already sent today — skipping"); return; }

    logger.info("Sending scheduled weekly payout emails...");
    const { fetchCommissionPct } = await import("./commission.js");
    const commissionPct = await fetchCommissionPct();

    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7); weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(now); weekEnd.setHours(0, 0, 0, 0);
    const weekLabel =
      weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " – " +
      new Date(weekEnd.getTime() - 1).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    const drivers = await db.select().from(driversTable).where(sql`approval_status = 'approved'`).orderBy(driversTable.name);
    const bookings = await db.select({ driverId: bookingsTable.driverId, priceQuoted: bookingsTable.priceQuoted })
      .from(bookingsTable)
      .where(sql`status = 'completed' AND driver_id IS NOT NULL AND pickup_at >= ${weekStart.toISOString()} AND pickup_at < ${weekEnd.toISOString()}`);

    const earningsByDriver = new Map<number, { rides: number; gross: number }>();
    for (const b of bookings) {
      if (!b.driverId) continue;
      const e = earningsByDriver.get(b.driverId) ?? { rides: 0, gross: 0 };
      earningsByDriver.set(b.driverId, { rides: e.rides + 1, gross: e.gross + parseFloat(String(b.priceQuoted ?? "0")) });
    }

    const { sendWeeklyDriverPayout, sendWeeklyPayoutAdminReport } = await import("./mailer.js");
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
      try { await sendWeeklyDriverPayout(p); }
      catch (err) { logger.error({ err, driverId: p.driverId }, "Failed to send weekly payout email to driver"); }
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

export async function runComplianceEnforcement(): Promise<void> {
  try {
    const now = new Date();
    if (now.getHours() !== 0 || now.getMinutes() > 5) return;

    const { driversTable, bookingsTable, complianceDocumentsTable } = await import("@workspace/db");
    const { sendComplianceLockoutAdmin } = await import("./mailer.js");
    const todayStr = now.toISOString().slice(0, 10);

    const drivers = await db.select({
      id: driversTable.id, name: driversTable.name, email: driversTable.email,
      complianceHold: driversTable.complianceHold,
      licenseExpiry: driversTable.licenseExpiry,
      regExpiry: driversTable.regExpiry,
      insuranceExpiry: driversTable.insuranceExpiry,
    }).from(driversTable);

    for (const driver of drivers) {
      const docChecks = [
        { label: "Driver License", expiry: driver.licenseExpiry },
        { label: "Vehicle Registration", expiry: driver.regExpiry },
        { label: "Insurance", expiry: driver.insuranceExpiry },
      ];

      for (const { label, expiry } of docChecks) {
        if (!expiry || expiry > todayStr) continue;

        const [approved] = await db.select({ id: complianceDocumentsTable.id })
          .from(complianceDocumentsTable)
          .where(and(
            eq(complianceDocumentsTable.driverId, driver.id),
            eq(complianceDocumentsTable.docType, label),
            eq(complianceDocumentsTable.status, "approved"),
          ))
          .limit(1);

        if (approved) continue;

        if (!driver.complianceHold) {
          await db.update(driversTable).set({ complianceHold: true }).where(eq(driversTable.id, driver.id));
          logger.info({ driverId: driver.id, docType: label }, "Driver placed on compliance_hold");

          const futureBookings = await db.select({ id: bookingsTable.id })
            .from(bookingsTable)
            .where(and(
              eq(bookingsTable.driverId, driver.id),
              gt(bookingsTable.pickupAt, now),
              or(eq(bookingsTable.status, "confirmed"), eq(bookingsTable.status, "pending")),
            ));

          if (futureBookings.length > 0) {
            await db.update(bookingsTable)
              .set({ driverId: null, status: "pending", updatedAt: new Date() })
              .where(and(
                eq(bookingsTable.driverId, driver.id),
                gt(bookingsTable.pickupAt, now),
                or(eq(bookingsTable.status, "confirmed"), eq(bookingsTable.status, "pending")),
              ));
          }

          try {
            await sendComplianceLockoutAdmin({
              driverName: driver.name, driverEmail: driver.email,
              docType: label, expiryDate: expiry,
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
