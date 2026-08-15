import { eq, and, gt, isNull, gte, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { logger } from "./logger";
import { safeDecryptField } from "./encrypt.js";
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
    const { fetchCommissionPct } = await import("./commission.js");
    const commissionPct = await fetchCommissionPct();

    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7); weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(now); weekEnd.setHours(0, 0, 0, 0);
    const weekLabel =
      weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " – " +
      new Date(weekEnd.getTime() - 1).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    const drivers = await db.select().from(driversTable).where(sql`approval_status = 'approved'`).orderBy(driversTable.name);
    const bookings = await db.select({ driverId: bookingsTable.driverId, priceQuoted: bookingsTable.priceQuoted, fareSubtotal: bookingsTable.fareSubtotal, tipAmount: bookingsTable.tipAmount })
      .from(bookingsTable)
      .where(sql`status = 'completed' AND driver_id IS NOT NULL AND pickup_at >= ${weekStart.toISOString()} AND pickup_at < ${weekEnd.toISOString()}`);

    const earningsByDriver = new Map<number, { rides: number; gross: number; tips: number }>();
    for (const b of bookings) {
      if (!b.driverId) continue;
      const e = earningsByDriver.get(b.driverId) ?? { rides: 0, gross: 0, tips: 0 };
      const fareBase = b.fareSubtotal != null ? parseFloat(String(b.fareSubtotal)) : parseFloat(String(b.priceQuoted ?? "0"));
      const tip = b.tipAmount != null ? parseFloat(String(b.tipAmount)) : 0;
      earningsByDriver.set(b.driverId, { rides: e.rides + 1, gross: e.gross + fareBase, tips: e.tips + tip });
    }

    const { sendWeeklyDriverPayout, sendWeeklyPayoutAdminReport } = await import("./mailer.js");
    const payouts = drivers.map(d => {
      const e = earningsByDriver.get(d.id) ?? { rides: 0, gross: 0, tips: 0 };
      // Tips are 100% the driver's — commission applies only to the fare base.
      const driverNet = Math.round((e.gross * commissionPct + e.tips) * 100) / 100;
      return {
        driverId: d.id, driverName: d.name, driverEmail: d.payoutEmail ?? d.email,
        rides: e.rides, grossEarnings: Math.round(e.gross * 100) / 100,
        tipsTotal: Math.round(e.tips * 100) / 100,
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
