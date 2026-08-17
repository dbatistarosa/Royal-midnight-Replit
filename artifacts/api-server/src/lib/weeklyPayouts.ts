/**
 * What each chauffeur is owed for a week.
 *
 * This existed twice, verbatim: once in GET /admin/payouts/weekly (the board an
 * operator pays from) and once in POST /admin/payouts/send-weekly (the statement
 * emailed to the chauffeur). Same week-start arithmetic, same commission lookup,
 * same aggregation, written out twice — so the moment one learned about overtime
 * and paid add-ons, the other would have kept settling short, and the statement
 * in the chauffeur's inbox would have contradicted the board.
 *
 * The email copy also passed `payout_account_number` straight through from the
 * row. That column is AES-GCM ciphertext, so the "****1234" mask in the
 * statement was the last four characters of an encrypted blob. The board did it
 * correctly via lastN(); one of them had to be wrong and it was the one the
 * chauffeur reads.
 */

import { sql, eq } from "drizzle-orm";
import { db, bookingsTable, driversTable, settingsTable } from "@workspace/db";
import { parseCommissionPct } from "./commission.js";
import { loadPayoutExtrasByDriver } from "./fareBreakdown.js";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type PayoutWeek = {
  weekStart: Date;
  weekEnd: Date;
  /** "Aug 11 – Aug 17, 2026", for statements. */
  weekLabel: string;
};

/**
 * The seven-day window starting at `weekStartStr`, or the current Monday-anchored
 * week when no start is given.
 *
 * An explicit start is taken literally — the scheduled run asks for "the seven
 * days ending today", which is not necessarily a Monday. An unparseable string
 * is treated as no string at all rather than silently becoming "today", which
 * would have produced a one-day payroll window.
 */
export function resolvePayoutWeek(weekStartStr?: string | null): PayoutWeek {
  const explicit = weekStartStr ? new Date(weekStartStr) : null;
  const hasExplicit = explicit != null && !Number.isNaN(explicit.getTime());

  const weekStart = hasExplicit ? explicit : new Date();
  if (!hasExplicit) {
    const day = weekStart.getDay(); // 0 = Sunday
    weekStart.setDate(weekStart.getDate() + (day === 0 ? -6 : 1 - day));
  }
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", opts);
  const weekLabel =
    fmt(weekStart, { month: "short", day: "numeric" }) +
    " – " +
    fmt(new Date(weekEnd.getTime() - 1), { month: "short", day: "numeric", year: "numeric" });

  return { weekStart, weekEnd, weekLabel };
}

export type DriverWeekEarnings = {
  driverId: number;
  rides: number;
  /** Commission base: fare subtotal + any pre-tax overtime. */
  grossEarnings: number;
  /** Commission on grossEarnings. */
  commission: number;
  /** Add-ons flagged paid_to_driver, kept in full with no commission taken. */
  extrasTotal: number;
  tipsTotal: number;
  /** commission + extrasTotal + tipsTotal. */
  driverNet: number;
};

/**
 * Per-chauffeur earnings for one week, keyed by driver id. Only chauffeurs with
 * at least one completed trip appear; callers fill in zeroes for the rest.
 */
export async function computeWeeklyEarnings(
  week: PayoutWeek,
): Promise<{ commissionPct: number; byDriver: Map<number, DriverWeekEarnings> }> {
  const [commRow] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "driver_commission_pct"));
  const commissionPct = parseCommissionPct(commRow?.value);

  const bookings = await db
    .select({
      driverId: bookingsTable.driverId,
      priceQuoted: bookingsTable.priceQuoted,
      fareSubtotal: bookingsTable.fareSubtotal,
      tipAmount: bookingsTable.tipAmount,
    })
    .from(bookingsTable)
    .where(sql`status = 'completed' AND driver_id IS NOT NULL
               AND pickup_at >= ${week.weekStart.toISOString()}
               AND pickup_at <  ${week.weekEnd.toISOString()}`);

  const extras = await loadPayoutExtrasByDriver(
    sql`b.status = 'completed' AND b.driver_id IS NOT NULL
        AND b.pickup_at >= ${week.weekStart.toISOString()}
        AND b.pickup_at <  ${week.weekEnd.toISOString()}`,
  );

  const raw = new Map<number, { rides: number; fare: number; tips: number }>();
  for (const b of bookings) {
    if (!b.driverId) continue;
    const cur = raw.get(b.driverId) ?? { rides: 0, fare: 0, tips: 0 };
    // fare_subtotal is the commission base; price_quoted only for legacy rows
    // that predate the column.
    cur.rides += 1;
    cur.fare += b.fareSubtotal != null ? parseFloat(b.fareSubtotal) : parseFloat(b.priceQuoted ?? "0");
    cur.tips += parseFloat(b.tipAmount ?? "0");
    raw.set(b.driverId, cur);
  }

  const byDriver = new Map<number, DriverWeekEarnings>();
  const driverIds = new Set([...raw.keys(), ...extras.keys()]);
  for (const driverId of driverIds) {
    const r = raw.get(driverId) ?? { rides: 0, fare: 0, tips: 0 };
    const e = extras.get(driverId) ?? { overageFare: 0, driverExtras: 0 };
    const grossEarnings = round2(r.fare + e.overageFare);
    const commission = round2(grossEarnings * commissionPct);
    const extrasTotal = round2(e.driverExtras);
    const tipsTotal = round2(r.tips);
    byDriver.set(driverId, {
      driverId,
      rides: r.rides,
      grossEarnings,
      commission,
      extrasTotal,
      tipsTotal,
      driverNet: round2(commission + extrasTotal + tipsTotal),
    });
  }

  return { commissionPct, byDriver };
}

/** Zero row, so a chauffeur with no trips still appears on the board. */
export function emptyWeekEarnings(driverId: number): DriverWeekEarnings {
  return { driverId, rides: 0, grossEarnings: 0, commission: 0, extrasTotal: 0, tipsTotal: 0, driverNet: 0 };
}

/** Approved chauffeurs, name-ordered — the roster both callers iterate. */
export async function loadApprovedDrivers(): Promise<(typeof driversTable.$inferSelect)[]> {
  return db.select().from(driversTable).where(sql`approval_status = 'approved'`).orderBy(driversTable.name);
}
