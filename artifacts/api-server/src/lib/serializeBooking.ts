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
 * Every money column this shape exposes is converted, and the reason is not
 * tidiness.
 *
 * hourly_rate was left as a string here on the grounds that no screen consumed
 * it. Then the charter panels started rendering it, called `.toFixed(2)` on
 * what was actually "75.00", and threw — taking the whole admin bookings page
 * to the error boundary the moment an hourly booking existed. A `numeric`
 * column that reaches the UI is a number or it is a crash waiting for the first
 * row that populates it.
 */
export function serializeBooking(b: typeof bookingsTable.$inferSelect) {
  const num = (v: string | null | undefined) => (v != null ? parseFloat(v) : null);
  const priceQuoted = parseFloat(b.priceQuoted ?? "0");
  return {
    ...b,
    priceQuoted,
    // Commission base: falls back to priceQuoted for legacy rows / booking paths
    // that don't supply it (e.g. admin manual bookings).
    fareSubtotal: b.fareSubtotal != null ? parseFloat(b.fareSubtotal) : priceQuoted,
    discountAmount: num(b.discountAmount),
    tipAmount: num(b.tipAmount),
    // Hourly charter terms, rendered by the charter panels in all three portals.
    hourlyRate: num(b.hourlyRate),
    extraMileRate: num(b.extraMileRate),
    extraCharge: b.extraCharge != null ? parseFloat(b.extraCharge) : 0,
    totalPrice: num(b.totalPrice),
    estimatedDistanceMiles: num(b.estimatedDistanceMiles),
    refundAmount: num(b.refundAmount),
    pickupAt: b.pickupAt.toISOString(),
    authorizedAt: b.authorizedAt != null ? b.authorizedAt.toISOString() : null,
    tripStartedAt: b.tripStartedAt != null ? b.tripStartedAt.toISOString() : null,
    tripEndedAt: b.tripEndedAt != null ? b.tripEndedAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}
