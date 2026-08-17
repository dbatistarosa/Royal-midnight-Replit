import { eq, and, gt, isNull, gte, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
// `pool` went unused when the reminder body moved out to tripReminders.ts.
// noUnusedLocals is off, so the build tolerated it — which is exactly why it
// sat there looking like this file still opened raw connections.
import { db } from "@workspace/db";
import { logger } from "./logger";
import { safeDecryptField, lastN } from "./encrypt.js";
// Reminders and driver-confirmation enforcement live in their own module now:
// the window-based version that used to sit here matched nothing on a
// scheduler that runs late. Re-exported so routes/cron.ts keeps its import.
export { sendTripReminders } from "./tripReminders.js";

export async function sendReviewRequests(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // ignore anything older than a week
    const { bookingsTable } = await import("@workspace/db");
    const { sendReviewRequestEmail } = await import("./mailer.js");

    const candidates = await db
      .select({ id: bookingsTable.id })
      .from(bookingsTable)
      .where(and(
        eq(bookingsTable.status, "completed"),
        isNull(bookingsTable.reviewRequestSentAt),
        gte(bookingsTable.updatedAt, cutoff),
      ));

    for (const { id } of candidates) {
      const [claimed] = await db
        .update(bookingsTable)
        .set({ reviewRequestSentAt: new Date() })
        .where(and(eq(bookingsTable.id, id), isNull(bookingsTable.reviewRequestSentAt)))
        .returning();

      if (!claimed) continue; // already claimed by a concurrent run

      try {
        await sendReviewRequestEmail({
          id: claimed.id,
          passengerName: claimed.passengerName,
          passengerEmail: claimed.passengerEmail,
          pickupAddress: claimed.pickupAddress,
          dropoffAddress: claimed.dropoffAddress,
          pickupAt: claimed.pickupAt.toISOString(),
          vehicleClass: claimed.vehicleClass ?? "standard",
          passengers: claimed.passengers ?? 1,
          priceQuoted: parseFloat(String(claimed.priceQuoted)),
        });
        logger.info({ bookingId: claimed.id }, "Review request sent");
      } catch (err) {
        logger.error({ err, bookingId: claimed.id }, "Failed to send review request (non-fatal)");
      }
    }
  } catch (err) {
    logger.error({ err }, "Review request scheduler error (non-fatal)");
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

    // Shared with the admin board and the manual send button. This was a third
    // hand-written copy of the same arithmetic and had already drifted: it paid
    // commission on the fare base alone, with no overtime and no add-ons, and
    // it passed the whole decrypted account number into the statement instead
    // of its last four.
    const { resolvePayoutWeek, computeWeeklyEarnings, loadApprovedDrivers, emptyWeekEarnings } =
      await import("./weeklyPayouts.js");

    // The scheduled run covers the seven days ending today, not the current
    // Monday-anchored week — it fires on a Monday morning for the week just
    // finished.
    const weekStartRaw = new Date(now); weekStartRaw.setDate(now.getDate() - 7); weekStartRaw.setHours(0, 0, 0, 0);
    const week = resolvePayoutWeek(weekStartRaw.toISOString());
    const { weekLabel } = week;

    const { commissionPct, byDriver } = await computeWeeklyEarnings(week);
    const drivers = await loadApprovedDrivers();

    const { sendWeeklyDriverPayout, sendWeeklyPayoutAdminReport } = await import("./mailer.js");
    const payouts = drivers.map(d => {
      const e = byDriver.get(d.id) ?? emptyWeekEarnings(d.id);
      return {
        driverId: d.id, driverName: d.name, driverEmail: d.payoutEmail ?? d.email,
        rides: e.rides, grossEarnings: e.grossEarnings,
        commission: e.commission, extrasTotal: e.extrasTotal, tipsTotal: e.tipsTotal,
        commissionPct, driverNet: e.driverNet, weekLabel,
        bankName: d.payoutBankName ?? null,
        routingNumber: safeDecryptField(d.payoutRoutingNumber),
        accountLast4: lastN(d.payoutAccountNumber, 4),
        legalName: d.payoutLegalName ?? null,
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
