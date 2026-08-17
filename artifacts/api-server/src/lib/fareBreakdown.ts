/**
 * The stored money breakdown of a booking.
 *
 * price_quoted has always been a single number, and everything downstream tried
 * to reverse-engineer it. The admin revenue report is the clearest casualty: it
 * computed "taxes collected" as `price_quoted - fare_subtotal`, so on a charter
 * with $860 of add-ons and a $10 airport fee it reported $896.51 of Florida tax
 * on a $1,121.51 booking — 80%. The number was never tax; it was every part of
 * the total that was not the commission base.
 *
 * These columns record what was actually charged, per line, at the moment it was
 * charged — so a later change to the tax rate or the card-fee percentage cannot
 * retroactively rewrite last quarter's books.
 *
 * They are written and read through guarded raw SQL rather than the drizzle
 * schema, deliberately. Adding a column to bookingsTable puts it into every
 * `db.select().from(bookingsTable)` in the codebase, and this project ships code
 * and migrations as separate steps — that combination has already taken
 * production down once (see the note in lib/db/src/schema/bookings.ts). Here,
 * code that runs before migration 0012 simply records nothing and the report
 * falls back to its legacy estimate.
 */

import { sql, inArray } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { hasPgErrorCode, UNDEFINED_COLUMN } from "./pgError.js";
import { normalizePercentRate } from "./pricing.js";

/**
 * The two pass-through rates, normalised.
 *
 * Both settings have been stored in either form over the life of this project —
 * `florida_tax_rate` is "0.07" while `cc_fee_pct` is "4" — so every reader has
 * to normalise, and several of them did it slightly differently. One place.
 */
export async function loadChargeRates(): Promise<{ taxRate: number; cardProcessingFeeRate: number }> {
  try {
    const rows = await db
      .select({ key: settingsTable.key, value: settingsTable.value })
      .from(settingsTable)
      .where(inArray(settingsTable.key, ["florida_tax_rate", "cc_fee_pct"]));
    const map = new Map(rows.map(r => [r.key, r.value]));
    return {
      taxRate: normalizePercentRate(parseFloat(map.get("florida_tax_rate") ?? "0.07") || 0),
      cardProcessingFeeRate: normalizePercentRate(parseFloat(map.get("cc_fee_pct") ?? "0") || 0),
    };
  } catch {
    return { taxRate: 0.07, cardProcessingFeeRate: 0 };
  }
}

export type FareBreakdownColumns = {
  /** Florida tax charged on the quote (service + add-ons). */
  taxAmount: number;
  /** Card processing fee charged on the quote. */
  cardFee: number;
  /** Airport surcharge, which is company revenue and not part of the
   *  chauffeur's commission base. */
  airportFee: number;
  /** Add-ons total at the prices frozen from extra_services. */
  extrasTotal: number;
};

export type OverageBreakdownColumns = {
  /** Pre-tax extra-time charge. This, not the total, is what the chauffeur's
   *  overtime commission is computed on. */
  overageFare: number;
  overageTax: number;
  overageCardFee: number;
};

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

/** True when the failure is "that column does not exist yet". */
function isMissingColumn(err: unknown): boolean {
  return hasPgErrorCode(err, UNDEFINED_COLUMN);
}

/**
 * Record the quote breakdown on a freshly-created booking.
 *
 * Fire-and-forget by design: the booking exists and the card has been
 * authorised by the time this runs, and losing a reporting column must never
 * undo either.
 */
export async function saveFareBreakdown(
  bookingId: number,
  b: FareBreakdownColumns,
  log?: { warn: (o: unknown, m: string) => void },
): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE bookings
         SET tax_amount   = ${b.taxAmount},
             card_fee     = ${b.cardFee},
             airport_fee  = ${b.airportFee},
             extras_total = ${b.extrasTotal}
       WHERE id = ${bookingId}
    `);
  } catch (err) {
    if (!isMissingColumn(err)) throw err;
    log?.warn(
      { bookingId },
      "fare breakdown columns missing — run migration 0012_fare_breakdown.sql; revenue report will use its legacy estimate",
    );
  }
}

/** Record the extra-time breakdown when an hourly charter is completed. */
export async function saveOverageBreakdown(
  bookingId: number,
  b: OverageBreakdownColumns & { overageMinutes: number; paymentIntentId?: string | null },
  log?: { warn: (o: unknown, m: string) => void },
): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE bookings
         SET overage_fare     = ${b.overageFare},
             overage_tax      = ${b.overageTax},
             overage_card_fee = ${b.overageCardFee},
             overage_minutes  = ${b.overageMinutes},
             extra_charge_payment_intent_id = ${b.paymentIntentId ?? null}
       WHERE id = ${bookingId}
    `);
  } catch (err) {
    if (!isMissingColumn(err)) throw err;
    log?.warn({ bookingId }, "overage breakdown columns missing — run migration 0012_fare_breakdown.sql");
  }
}

/**
 * Pre-tax extra-time charge per booking, for the chauffeur's overtime
 * commission.
 *
 * bookings.extra_charge is what the *customer* pays, and since extra time
 * started carrying tax and the card fee that is no longer the commission base —
 * paying 70% of it would hand the chauffeur a share of Florida's sales tax.
 *
 * Bookings older than migration 0012, and any row where the column is still
 * absent, are simply missing from the map; callers fall back to extra_charge,
 * which for those rows genuinely was the untaxed figure.
 */
export async function loadOverageFares(bookingIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (bookingIds.length === 0) return out;

  try {
    const ids = sql.join(bookingIds.map(id => sql`${id}`), sql`, `);
    const result = await db.execute(sql`
      SELECT id, overage_fare FROM bookings
       WHERE id IN (${ids}) AND overage_fare IS NOT NULL
    `);
    const rows = (result as unknown as { rows?: Record<string, unknown>[] }).rows
      ?? (result as unknown as Record<string, unknown>[])
      ?? [];
    for (const r of rows) out.set(Number(r["id"]), num(r["overage_fare"]));
  } catch (err) {
    if (!isMissingColumn(err)) throw err;
  }
  return out;
}

/** The receipt lines a passenger is shown for one booking. */
export type BookingReceipt = {
  taxAmount: number | null;
  cardFee: number | null;
  airportFee: number | null;
  extrasTotal: number | null;
  overageFare: number | null;
  overageTax: number | null;
  overageCardFee: number | null;
  /** Null after a completed hourly charter means the extra time is still owed. */
  extraChargePaymentIntentId: string | null;
};

/**
 * The stored receipt lines for a set of bookings.
 *
 * The passenger's receipt used to print `priceQuoted * 0.8` as the fare and
 * `priceQuoted * 0.2` as "Taxes & Fees" — two hardcoded fractions that were
 * never anybody's tax rate. On a booking with $860 of add-ons it showed an
 * $897.21 "Hourly charter · 3 hrs" line for a charter whose fare was $235, and
 * then listed the add-ons again underneath, so the total double-counted them.
 * Returns null fields for rows sold before migration 0012; the receipt shows
 * the older, simpler layout for those rather than inventing numbers.
 */
export async function loadBookingReceipts(bookingIds: number[]): Promise<Map<number, BookingReceipt>> {
  const out = new Map<number, BookingReceipt>();
  if (bookingIds.length === 0) return out;

  try {
    const ids = sql.join(bookingIds.map(id => sql`${id}`), sql`, `);
    const result = await db.execute(sql`
      SELECT id, tax_amount, card_fee, airport_fee, extras_total,
             overage_fare, overage_tax, overage_card_fee, extra_charge_payment_intent_id
        FROM bookings WHERE id IN (${ids})
    `);
    const rows = (result as unknown as { rows?: Record<string, unknown>[] }).rows
      ?? (result as unknown as Record<string, unknown>[])
      ?? [];
    const orNull = (v: unknown): number | null => (v == null ? null : num(v));
    for (const r of rows) {
      out.set(Number(r["id"]), {
        taxAmount: orNull(r["tax_amount"]),
        cardFee: orNull(r["card_fee"]),
        airportFee: orNull(r["airport_fee"]),
        extrasTotal: orNull(r["extras_total"]),
        overageFare: orNull(r["overage_fare"]),
        overageTax: orNull(r["overage_tax"]),
        overageCardFee: orNull(r["overage_card_fee"]),
        extraChargePaymentIntentId: (r["extra_charge_payment_intent_id"] as string | null) ?? null,
      });
    }
  } catch (err) {
    if (!isMissingColumn(err)) throw err;
  }
  return out;
}

/** One completed trip's chauffeur-side extras, for the earnings screen. */
export type DriverEarningRow = {
  createdAt: Date;
  /** Pre-tax extra-time charge on this trip. */
  overageFare: number;
  /** Add-ons flagged paid_to_driver, which the chauffeur keeps in full. */
  driverExtras: number;
};

/**
 * The two components of chauffeur pay that the earnings endpoint never counted.
 *
 * /drivers/:id/earnings summed `coalesce(fare_subtotal, price_quoted)` and
 * nothing else, so a chauffeur who fitted a car seat, carried a pet, or worked
 * an extra hour past the contracted block saw none of it on their earnings
 * screen — even though the trip card on their dashboard showed all three.
 *
 * Both sources are optional at the schema level: `overage_fare` arrives with
 * migration 0012 and `paid_to_driver` with 0011, and either being absent
 * degrades to zero rather than failing the request.
 */
async function runDriverExtraQuery(where: ReturnType<typeof sql>): Promise<Record<string, unknown>[]> {
  const run = async (opts: { overage: boolean; paidFlag: boolean }) => {
    const overageCol = opts.overage ? sql`coalesce(b.overage_fare, 0)` : sql`0`;
    const paidFilter = opts.paidFlag ? sql`es.paid_to_driver` : sql`false`;
    const result = await db.execute(sql`
      SELECT b.id, b.driver_id, b.created_at,
             ${overageCol} AS overage_fare,
             coalesce((
               SELECT sum(be.price_at_booking * be.quantity)
                 FROM booking_extras be
                 JOIN extra_services es ON es.id = be.extra_service_id
                WHERE be.booking_id = b.id AND ${paidFilter}
             ), 0) AS driver_extras
        FROM bookings b
       WHERE ${where}
    `);
    return (result as unknown as { rows?: Record<string, unknown>[] }).rows
      ?? (result as unknown as Record<string, unknown>[])
      ?? [];
  };

  try {
    return await run({ overage: true, paidFlag: true });
  } catch (err) {
    if (!isMissingColumn(err)) throw err;
    try {
      return await run({ overage: false, paidFlag: true });
    } catch (err2) {
      if (!isMissingColumn(err2)) throw err2;
      return await run({ overage: false, paidFlag: false });
    }
  }
}

export async function loadDriverEarningRows(driverId: number): Promise<DriverEarningRow[]> {
  const rows = await runDriverExtraQuery(
    sql`b.driver_id = ${driverId} AND b.status = 'completed'`,
  );
  return rows.map(r => ({
    createdAt: new Date(String(r["created_at"])),
    overageFare: num(r["overage_fare"]),
    driverExtras: num(r["driver_extras"]),
  }));
}

/**
 * Same two components, totalled per chauffeur, for the weekly payout board.
 *
 * That board and the chauffeur's own Earnings screen are meant to show the same
 * money and did not: the board paid commission on `fare_subtotal` alone, so a
 * week containing an overrun charter or a car-seat fitting settled short of
 * what the chauffeur had been shown they had earned.
 */
export async function loadPayoutExtrasByDriver(
  where: ReturnType<typeof sql>,
): Promise<Map<number, { overageFare: number; driverExtras: number }>> {
  const rows = await runDriverExtraQuery(where);
  const out = new Map<number, { overageFare: number; driverExtras: number }>();
  for (const r of rows) {
    const driverId = r["driver_id"] == null ? null : Number(r["driver_id"]);
    if (driverId == null || Number.isNaN(driverId)) continue;
    const cur = out.get(driverId) ?? { overageFare: 0, driverExtras: 0 };
    cur.overageFare += num(r["overage_fare"]);
    cur.driverExtras += num(r["driver_extras"]);
    out.set(driverId, cur);
  }
  return out;
}

export type BookingMoneyRow = {
  id: number;
  priceQuoted: number;
  fareSubtotal: number;
  discountAmount: number;
  extraCharge: number;
  tipAmount: number;
  /** Null on rows created before migration 0012 — callers must fall back. */
  taxAmount: number | null;
  cardFee: number | null;
  airportFee: number | null;
  extrasTotal: number | null;
  overageFare: number | null;
  overageTax: number | null;
  overageCardFee: number | null;
};

/**
 * Every completed booking's money, one row each, for the revenue report.
 *
 * Returns the per-booking numbers rather than SQL aggregates so the report can
 * apply the legacy fallback row by row: bookings taken before migration 0012
 * have no stored tax and have to be estimated, while everything after it is
 * exact. An aggregate cannot mix the two honestly.
 */
export async function loadCompletedBookingMoney(where: ReturnType<typeof sql>): Promise<BookingMoneyRow[]> {
  const run = async (withBreakdown: boolean) => {
    const cols = withBreakdown
      ? sql`tax_amount, card_fee, airport_fee, extras_total, overage_fare, overage_tax, overage_card_fee`
      : sql`NULL::numeric AS tax_amount, NULL::numeric AS card_fee, NULL::numeric AS airport_fee,
            NULL::numeric AS extras_total, NULL::numeric AS overage_fare, NULL::numeric AS overage_tax,
            NULL::numeric AS overage_card_fee`;
    const result = await db.execute(sql`
      SELECT id, price_quoted, fare_subtotal, discount_amount, extra_charge, tip_amount, ${cols}
        FROM bookings
       WHERE ${where}
    `);
    return (result as unknown as { rows?: Record<string, unknown>[] }).rows
      ?? (result as unknown as Record<string, unknown>[])
      ?? [];
  };

  let rows: Record<string, unknown>[];
  try {
    rows = await run(true);
  } catch (err) {
    if (!isMissingColumn(err)) throw err;
    rows = await run(false);
  }

  const orNull = (v: unknown): number | null => (v == null ? null : num(v));

  return rows.map(r => ({
    id: Number(r["id"]),
    priceQuoted: num(r["price_quoted"]),
    fareSubtotal: r["fare_subtotal"] == null ? num(r["price_quoted"]) : num(r["fare_subtotal"]),
    discountAmount: num(r["discount_amount"]),
    extraCharge: num(r["extra_charge"]),
    tipAmount: num(r["tip_amount"]),
    taxAmount: orNull(r["tax_amount"]),
    cardFee: orNull(r["card_fee"]),
    airportFee: orNull(r["airport_fee"]),
    extrasTotal: orNull(r["extras_total"]),
    overageFare: orNull(r["overage_fare"]),
    overageTax: orNull(r["overage_tax"]),
    overageCardFee: orNull(r["overage_card_fee"]),
  }));
}
