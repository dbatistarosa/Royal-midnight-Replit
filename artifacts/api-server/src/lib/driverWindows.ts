/**
 * The two deadlines that decide whether a chauffeur keeps a trip.
 *
 * They were defined in separate files and happened to be the same number, which
 * is the bug:
 *
 *   POST /bookings/:id/trip/on-way refused "On the Way" until 60 minutes before
 *   pickup, and releaseUnconfirmedDrivers() took the trip away at 60 minutes
 *   before pickup.
 *
 * The window in which a driver was allowed to confirm and the deadline by which
 * they had to have confirmed opened at the same instant. A sweep landing a
 * minute later unassigned a driver who had had sixty seconds to act, recorded a
 * warning, blocked them from that trip permanently, and emailed them about it.
 * Three of those suspend the account. Nothing in the sweep required that the
 * driver ever had a realistic opportunity.
 *
 * Both numbers live here, together, with the invariant that relates them
 * enforced in code rather than left to whoever edits one of them next.
 */

import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/** How early a chauffeur may mark themselves On the Way, in minutes.
 *  Generous on purpose: a trip an hour's drive away has to be started well
 *  before the old 60-minute limit allowed. */
export const DEFAULT_CONFIRM_WINDOW_MINUTES = 120;

/** How late an unconfirmed chauffeur keeps the trip, in minutes before pickup.
 *  Late enough to be a real deadline, early enough that dispatch can still
 *  reassign. */
export const DEFAULT_RELEASE_MINUTES = 45;

/** The confirmation window must exceed the release deadline by at least this
 *  much, or a driver can be punished for missing a window that barely opened. */
export const MIN_GRACE_MINUTES = 30;

async function getSettingNumber(key: string, fallback: number): Promise<number> {
  try {
    const [row] = await db.select({ value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, key));
    const n = parseFloat(row?.value ?? "");
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

export type DriverWindows = {
  /** Minutes before pickup from which "On the Way" is accepted. */
  confirmWindowMinutes: number;
  /** Minutes before pickup at which an unconfirmed driver loses the trip. */
  releaseMinutes: number;
  /** How long the driver actually has to act, in minutes. */
  graceMinutes: number;
};

/**
 * Resolve both windows together, clamped so the grace period can never
 * collapse.
 *
 * If an operator sets a release deadline at or above the confirmation window —
 * exactly the state this codebase shipped in — the release is pulled back
 * rather than the confirmation window being pushed out. Being slower to
 * reassign is recoverable; punishing a driver who never had a chance is not,
 * because the warning and the permanent per-trip block are already written by
 * the time anyone notices.
 */
export async function getDriverWindows(): Promise<DriverWindows> {
  const confirmWindowMinutes = await getSettingNumber("driver_confirm_window_minutes", DEFAULT_CONFIRM_WINDOW_MINUTES);
  const requestedRelease = await getSettingNumber("driver_release_minutes", DEFAULT_RELEASE_MINUTES);

  const maxRelease = confirmWindowMinutes - MIN_GRACE_MINUTES;
  const releaseMinutes = Math.max(1, Math.min(requestedRelease, maxRelease));

  return {
    confirmWindowMinutes,
    releaseMinutes,
    graceMinutes: confirmWindowMinutes - releaseMinutes,
  };
}
