import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { loadExtrasFor, driverExtrasTotal } from "./bookingExtras.js";

export function parseCommissionPct(raw: string | undefined): number {
  const n = parseFloat(raw ?? "70");
  return isNaN(n) ? 0.70 : n > 1 ? n / 100 : n;
}

export async function fetchCommissionPct(): Promise<number> {
  const [row] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "driver_commission_pct"))
    .limit(1);
  return parseCommissionPct(row?.value);
}

/**
 * What a chauffeur takes home from one trip.
 *
 * Three components on different terms — commission on the fare, commission on
 * any overtime, and the add-ons flagged paid_to_driver kept in full. The trip
 * card in the chauffeur's app has shown all three since add-ons shipped, but
 * every email and push notification computed `fareSubtotal * commissionPct` on
 * its own, in six separate places. So a trip offer that included a car seat and
 * a pet was pushed as "$157.50 earnings" and then appeared in the app as
 * $217.50 — the chauffeur had no way to know which was real.
 *
 * Same formula as toDriverView() in routes/bookings.ts, which is what the app
 * renders.
 */
export function computeDriverEarnings(params: {
  fareSubtotal: number;
  commissionPct: number;
  /** Add-ons the chauffeur keeps in full. */
  driverExtras?: number;
  /** Pre-tax overtime charge; zero until a charter actually runs long. */
  overtimeFare?: number;
}): number {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const fare = round2(params.fareSubtotal * params.commissionPct);
  const overtime = round2((params.overtimeFare ?? 0) * params.commissionPct);
  return round2(fare + overtime + round2(params.driverExtras ?? 0));
}

/**
 * The same figure for a booking that is being offered or assigned, loading the
 * add-ons itself. Overtime is always zero here — the trip has not run yet.
 *
 * Never throws: an add-on lookup that fails degrades to commission-only, which
 * is what these notifications showed before. A failed email is worse than an
 * email missing $20 of car-seat fee.
 */
export async function driverEarningsForBooking(
  bookingId: number,
  fareSubtotal: number,
  commissionPct: number,
): Promise<number> {
  let driverExtras = 0;
  try {
    driverExtras = driverExtrasTotal(await loadExtrasFor(bookingId));
  } catch {
    // fall through with 0
  }
  return computeDriverEarnings({ fareSubtotal, commissionPct, driverExtras });
}
