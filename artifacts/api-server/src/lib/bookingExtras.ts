import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/**
 * The add-ons attached to a booking.
 *
 * booking_extras has been written on every booking since extras shipped and
 * read back by nothing — no endpoint returned them, so no screen could show
 * them. A chauffeur arriving for a trip had no way to know a car seat or a pet
 * was expected, which is the one case where not knowing means arriving unable
 * to do the job.
 *
 * Loaded with an explicit join rather than through the drizzle schema so
 * `paid_to_driver` (migration 0011) being absent degrades to "no extra is paid
 * to the driver" instead of throwing — the failure that took production down
 * when pickup_lat was added to bookingsTable.
 */

export type BookingExtra = {
  id: number;
  name: string;
  category: string;
  quantity: number;
  /** Unit price frozen at booking time, not today's catalogue price. */
  price: number;
  /** Line total: price x quantity. */
  total: number;
  /** Paid to the chauffeur in full, with no commission taken. */
  paidToDriver: boolean;
};

type ExtraRow = {
  booking_id: number | string;
  extra_service_id: number | string;
  name: string | null;
  category: string | null;
  quantity: number | string;
  price_at_booking: string | number;
  paid_to_driver?: boolean | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function toExtra(r: ExtraRow): BookingExtra {
  const price = Number(r.price_at_booking) || 0;
  const quantity = Number(r.quantity) || 1;
  return {
    id: Number(r.extra_service_id),
    name: r.name ?? "Extra",
    category: r.category ?? "amenity",
    quantity,
    price: round2(price),
    total: round2(price * quantity),
    paidToDriver: r.paid_to_driver === true,
  };
}

/**
 * Extras for a set of bookings, keyed by booking id. One query for the whole
 * page rather than one per row.
 */
export async function loadBookingExtras(bookingIds: number[]): Promise<Map<number, BookingExtra[]>> {
  const out = new Map<number, BookingExtra[]>();
  if (bookingIds.length === 0) return out;

  const ids = sql.join(bookingIds.map(id => sql`${id}`), sql`, `);

  const run = async (withFlag: boolean) => {
    const flagCol = withFlag ? sql`es.paid_to_driver` : sql`false AS paid_to_driver`;
    const result = await db.execute(sql`
      SELECT be.booking_id, be.extra_service_id, be.quantity, be.price_at_booking,
             es.name, es.category, ${flagCol}
        FROM booking_extras be
        LEFT JOIN extra_services es ON es.id = be.extra_service_id
       WHERE be.booking_id IN (${ids})
       ORDER BY be.id
    `);
    return (result as unknown as { rows?: ExtraRow[] }).rows ?? (result as unknown as ExtraRow[]) ?? [];
  };

  let rows: ExtraRow[];
  try {
    rows = await run(true);
  } catch {
    // paid_to_driver not there yet (migration 0011). Everything reads as
    // company-owned, which is exactly the behaviour before this feature.
    try {
      rows = await run(false);
    } catch {
      return out;
    }
  }

  for (const r of rows) {
    const bookingId = Number(r.booking_id);
    const list = out.get(bookingId) ?? [];
    list.push(toExtra(r));
    out.set(bookingId, list);
  }
  return out;
}

/** Single-booking convenience. */
export async function loadExtrasFor(bookingId: number): Promise<BookingExtra[]> {
  return (await loadBookingExtras([bookingId])).get(bookingId) ?? [];
}

/**
 * What the chauffeur keeps from the add-ons: the full price of every extra
 * flagged paid_to_driver, with no commission applied. The operator's rule is
 * that these are the chauffeur's own work or equipment, so the company takes
 * no share.
 */
export function driverExtrasTotal(extras: BookingExtra[]): number {
  return round2(extras.filter(e => e.paidToDriver).reduce((sum, e) => sum + e.total, 0));
}

/** What the company keeps from the add-ons. */
export function companyExtrasTotal(extras: BookingExtra[]): number {
  return round2(extras.filter(e => !e.paidToDriver).reduce((sum, e) => sum + e.total, 0));
}
