import { and, eq, isNull, isNotNull, lte, sql } from "drizzle-orm";
import { db, bookingsTable, driversTable, bookingDriverBlocksTable, driverWarningsTable, WARNINGS_BEFORE_SUSPENSION } from "@workspace/db";
import { logger } from "./logger";
import { getDriverWindows } from "./driverWindows.js";

/**
 * Trip reminders and driver-confirmation enforcement.
 *
 * Replaces a version that only acted on bookings inside a 10-MINUTE window
 * (55-65 minutes before pickup). The GitHub Actions workflow driving it is
 * scheduled `*` slash `10` but actually fires every 40 to 73 minutes — GitHub
 * queues scheduled workflows best-effort and routinely delays or skips them.
 * The window was narrower than the real cadence, so the job reported success on
 * every run while silently matching nothing. Booking #6 went to pickup with
 * nobody notified.
 *
 * Everything here is therefore DUE-BASED, not window-based: "pickup is within
 * 24h / 2h / 1h and this stage has not run yet". That is idempotent and catches
 * up on its own however late the scheduler arrives — a reminder that should
 * have gone at T-24h still goes at T-23h rather than never.
 *
 * Each stage claims its row with a conditional UPDATE ... RETURNING before
 * sending anything, so two overlapping runs cannot both send the same email.
 */

/** A stage only fires while the trip is still ahead of us; a reminder for a
 *  pickup that already happened is noise, not a catch-up. */
const STAGES = [
  { key: "24h" as const, leadMs: 24 * 60 * 60 * 1000, label: "24 Hours", column: bookingsTable.reminder24hSentAt },
  { key: "2h" as const, leadMs: 2 * 60 * 60 * 1000, label: "2 Hours", column: bookingsTable.reminder2hSentAt },
];

/** Statuses that mean the driver has actively confirmed they are moving. */
const CONFIRMED_STATUSES = ["on_way", "on_location", "in_progress", "completed"];

interface ReminderRow {
  id: number;
  passengerName: string;
  passengerEmail: string;
  passengerPhone: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: Date;
  vehicleClass: string | null;
  passengers: number;
  priceQuoted: string;
  fareSubtotal: string | null;
  driverId: number | null;
}

const reminderColumns = {
  id: bookingsTable.id,
  passengerName: bookingsTable.passengerName,
  passengerEmail: bookingsTable.passengerEmail,
  passengerPhone: bookingsTable.passengerPhone,
  pickupAddress: bookingsTable.pickupAddress,
  dropoffAddress: bookingsTable.dropoffAddress,
  pickupAt: bookingsTable.pickupAt,
  vehicleClass: bookingsTable.vehicleClass,
  passengers: bookingsTable.passengers,
  priceQuoted: bookingsTable.priceQuoted,
  fareSubtotal: bookingsTable.fareSubtotal,
  driverId: bookingsTable.driverId,
};

/** Bookings that are live and still going to happen. A cancelled or completed
 *  trip needs no reminder, and neither does one still awaiting payment. */
function isLiveBooking() {
  return sql`${bookingsTable.status} IN ('confirmed','on_way','on_location','pending','authorized')`;
}

export async function sendTripReminders(): Promise<void> {
  for (const stage of STAGES) {
    try {
      await runReminderStage(stage);
    } catch (err) {
      logger.error({ err, stage: stage.key }, "trip reminder stage failed (non-fatal)");
    }
  }

  try {
    await releaseUnconfirmedDrivers();
  } catch (err) {
    logger.error({ err }, "driver release sweep failed (non-fatal)");
  }
}

async function runReminderStage(stage: (typeof STAGES)[number]): Promise<void> {
  const now = new Date();
  const dueBy = new Date(now.getTime() + stage.leadMs);

  const due = await db
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(and(
      isNull(stage.column),
      lte(bookingsTable.pickupAt, dueBy),
      sql`${bookingsTable.pickupAt} > now()`,
      isLiveBooking(),
    ));

  for (const { id } of due) {
    // Claim first. The UPDATE only succeeds for whoever gets there first, so an
    // overlapping run finds nothing to do rather than sending a duplicate.
    const [claimed] = await db
      .update(bookingsTable)
      .set({ [stage.key === "24h" ? "reminder24hSentAt" : "reminder2hSentAt"]: now })
      .where(and(eq(bookingsTable.id, id), isNull(stage.column)))
      .returning(reminderColumns);

    if (!claimed) continue;

    try {
      await sendStageEmails(claimed as ReminderRow, stage.label, stage.key);
      logger.info({ bookingId: id, stage: stage.key }, "trip reminder sent");
    } catch (err) {
      // Release the claim so the next sweep retries instead of the reminder
      // being lost to a transient mail failure.
      await db
        .update(bookingsTable)
        .set({ [stage.key === "24h" ? "reminder24hSentAt" : "reminder2hSentAt"]: null })
        .where(eq(bookingsTable.id, id));
      logger.error({ err, bookingId: id, stage: stage.key }, "trip reminder failed, claim released for retry");
    }
  }
}

async function sendStageEmails(row: ReminderRow, label: string, stageKey: "24h" | "2h"): Promise<void> {
  const { sendTripReminderPassenger, sendTripReminderDriver, sendTripReminderAdmin } = await import("./mailer.js");
  const { fetchCommissionPct } = await import("./commission.js");

  const driver = row.driverId
    ? (await db.select().from(driversTable).where(eq(driversTable.id, row.driverId)))[0]
    : undefined;

  const commissionPct = await fetchCommissionPct();
  const priceQuoted = parseFloat(String(row.priceQuoted ?? "0"));
  const fareSubtotal = row.fareSubtotal != null ? parseFloat(String(row.fareSubtotal)) : priceQuoted;

  const data = {
    id: row.id,
    passengerName: row.passengerName,
    passengerEmail: row.passengerEmail,
    pickupAddress: row.pickupAddress,
    dropoffAddress: row.dropoffAddress,
    pickupAt: new Date(row.pickupAt).toISOString(),
    vehicleClass: row.vehicleClass ?? "business",
    passengers: row.passengers,
    priceQuoted,
    driverName: driver?.name,
    driverPhone: driver?.phone,
    driverEarnings: Math.round(fareSubtotal * commissionPct * 100) / 100,
  };

  await sendTripReminderPassenger(data, label);
  if (driver?.email) await sendTripReminderDriver(data, driver.email, label);
  // The admin copy goes out whether or not a driver is assigned — an
  // unassigned trip two hours out is exactly what someone needs to see.
  await sendTripReminderAdmin(data, label);

  // The chauffeur introduction belongs with the last reminder before pickup.
  if (stageKey === "2h" && driver) {
    const { sendChauffeurIntroSms } = await import("./sms.js");
    sendChauffeurIntroSms(
      row.passengerPhone ?? null,
      driver.name,
      `RM-${String(row.id).padStart(4, "0")}`,
      new Date(row.pickupAt).toISOString(),
    ).catch(smsErr => logger.warn({ smsErr, bookingId: row.id }, "chauffeur intro SMS failed (non-fatal)"));
  }
}

/**
 * Shortly before pickup, a driver who has not confirmed loses the trip.
 *
 * The trip returns to the open pool for everyone else, the driver is blocked
 * from seeing it again, and the incident is recorded against their account.
 * Three warnings suspends them.
 *
 * The deadline comes from lib/driverWindows.ts rather than being written here,
 * because it only makes sense relative to when the driver is first *allowed* to
 * confirm. Those two numbers used to be the same (60 minutes), so a driver
 * could be released a minute after their confirmation window opened.
 */
async function releaseUnconfirmedDrivers(): Promise<void> {
  const now = new Date();
  const { releaseMinutes, graceMinutes } = await getDriverWindows();
  const deadline = new Date(now.getTime() + releaseMinutes * 60 * 1000);

  const overdue = await db
    .select({
      id: bookingsTable.id,
      driverId: bookingsTable.driverId,
      passengerName: bookingsTable.passengerName,
      pickupAddress: bookingsTable.pickupAddress,
      pickupAt: bookingsTable.pickupAt,
    })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.status, "confirmed"),
      isNotNull(bookingsTable.driverId),
      isNull(bookingsTable.driverReleasedAt),
      lte(bookingsTable.pickupAt, deadline),
      sql`${bookingsTable.pickupAt} > now()`,
      sql`${bookingsTable.status} NOT IN (${sql.join(CONFIRMED_STATUSES.map(st => sql`${st}`), sql`, `)})`,
    ));

  for (const booking of overdue) {
    const driverId = booking.driverId!;
    try {
      // Claim: unassign only if the driver is still the one on the row and it
      // has not already been released. A driver who confirms in this same
      // second keeps the trip.
      const [released] = await db
        .update(bookingsTable)
        .set({ driverId: null, driverReleasedAt: now, status: "pending" })
        .where(and(
          eq(bookingsTable.id, booking.id),
          eq(bookingsTable.driverId, driverId),
          eq(bookingsTable.status, "confirmed"),
          isNull(bookingsTable.driverReleasedAt),
        ))
        .returning({ id: bookingsTable.id });
      if (!released) continue;

      await db.insert(bookingDriverBlocksTable)
        .values({ bookingId: booking.id, driverId, reason: "no_confirmation" })
        .onConflictDoNothing();

      await db.insert(driverWarningsTable).values({
        driverId,
        bookingId: booking.id,
        reason: "no_confirmation",
        notes:
          `Did not mark On the Way for RM-${String(booking.id).padStart(4, "0")} ` +
          `within the ${graceMinutes}-minute confirmation window before pickup`,
      });

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(driverWarningsTable)
        .where(eq(driverWarningsTable.driverId, driverId));
      const warningCount = Number(count ?? 0);
      const suspended = warningCount >= WARNINGS_BEFORE_SUSPENSION;

      const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, driverId));

      if (suspended && driver) {
        await db.update(driversTable)
          .set({ status: "paused", isOnline: false })
          .where(eq(driversTable.id, driverId));
      }

      const { sendDriverReleasedAdmin, sendDriverNoConfirmationWarning } = await import("./mailer.js");
      await sendDriverReleasedAdmin({
        bookingId: booking.id,
        passengerName: booking.passengerName,
        pickupAddress: booking.pickupAddress,
        pickupAt: new Date(booking.pickupAt).toISOString(),
        driverName: driver?.name ?? `#${driverId}`,
        driverPhone: driver?.phone ?? "—",
        warningCount,
        suspended,
      });

      if (driver?.email) {
        await sendDriverNoConfirmationWarning({
          driverEmail: driver.email,
          driverName: driver.name,
          bookingId: booking.id,
          pickupAt: new Date(booking.pickupAt).toISOString(),
          warningCount,
          suspended,
        });
      }

      logger.warn({ bookingId: booking.id, driverId, warningCount, suspended }, "driver released for no confirmation");
    } catch (err) {
      logger.error({ err, bookingId: booking.id, driverId }, "failed to release unconfirmed driver (non-fatal)");
    }
  }
}
