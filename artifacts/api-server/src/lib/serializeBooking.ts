import type { bookingsTable } from "@workspace/db";

/**
 * The one way a booking row becomes a JSON response.
 *
 * Postgres `numeric` columns come back from drizzle as strings, while the
 * generated response contracts in @workspace/api-zod declare them as numbers.
 * Every endpoint that returns a booking therefore has to convert them, and
 * three separate copies of that conversion had grown — in routes/bookings.ts,
 * routes/admin.ts and routes/users.ts.
 *
 * Two of them then drifted. `fare_subtotal` was added to the schema and to the
 * OpenAPI contract as `zod.number().nullish()`, and only the bookings.ts copy
 * learned to parse it. The other two kept returning the raw string, so
 * `GetUserBookingsResponse.parse()` and `GetRecentBookingsResponse.parse()`
 * threw `Expected number, received string` on every booking that had one — a
 * 500 that emptied the passenger's "My Rides" page (upcoming *and* past) and
 * the admin dashboard's recent-bookings list, while the data itself was
 * perfectly fine.
 *
 * Keeping this in one place is the actual fix; adding the missing parseFloat in
 * two files would just reset the clock on the next numeric column.
 */
/**
 * Deliberately converts exactly the fields the routes/bookings.ts copy already
 * converted, and no more. The other numeric columns (extra_charge, total_price,
 * hourly_rate, …) also arrive as strings, but they are consumed as strings by
 * screens that are working today; turning them into numbers here would be a
 * silent shape change across every booking endpoint at once, which is a
 * regression risk with no bug behind it. If one of them ever needs to be a
 * number in a contract, it belongs here — with its callers checked.
 */
export function serializeBooking(b: typeof bookingsTable.$inferSelect) {
  const priceQuoted = parseFloat(b.priceQuoted ?? "0");
  return {
    ...b,
    priceQuoted,
    // Commission base: falls back to priceQuoted for legacy rows / booking paths
    // that don't supply it (e.g. admin manual bookings).
    fareSubtotal: b.fareSubtotal != null ? parseFloat(b.fareSubtotal) : priceQuoted,
    discountAmount: b.discountAmount != null ? parseFloat(b.discountAmount) : null,
    tipAmount: b.tipAmount != null ? parseFloat(b.tipAmount) : null,
    pickupAt: b.pickupAt.toISOString(),
    authorizedAt: b.authorizedAt != null ? b.authorizedAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}
