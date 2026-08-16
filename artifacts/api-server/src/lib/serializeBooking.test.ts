import { describe, it, expect } from "vitest";
import { serializeBooking } from "./serializeBooking";
import type { bookingsTable } from "@workspace/db";

/**
 * Regression guard for the bug that emptied the passenger's "My Rides" page and
 * the admin dashboard's Recent Operations list.
 *
 * fare_subtotal is a Postgres numeric, so drizzle hands it back as a string,
 * while the generated response contracts declare it `zod.number().nullish()`.
 * Two of the three hand-rolled row-to-JSON mappers never parsed it, so
 * GetUserBookingsResponse.parse() and GetRecentBookingsResponse.parse() threw
 * "Expected number, received string" and both screens rendered as empty — with
 * the underlying rows entirely healthy.
 */

const row = (over: Partial<typeof bookingsTable.$inferSelect> = {}) =>
  ({
    id: 1,
    passengerName: "Eliot",
    passengerEmail: "e@example.com",
    passengerPhone: "555",
    pickupAddress: "FLL",
    dropoffAddress: "Miami Beach",
    pickupAt: new Date("2026-08-22T12:00:00Z"),
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    authorizedAt: null,
    priceQuoted: "165.81",
    fareSubtotal: "140.00",
    discountAmount: null,
    tipAmount: null,
    ...over,
  }) as unknown as typeof bookingsTable.$inferSelect;

describe("serializeBooking", () => {
  it("returns every numeric money column as a number, not a string", () => {
    const out = serializeBooking(row({ discountAmount: "10.00", tipAmount: "5.50" }));
    expect(typeof out.priceQuoted).toBe("number");
    expect(typeof out.fareSubtotal).toBe("number");
    expect(typeof out.discountAmount).toBe("number");
    expect(typeof out.tipAmount).toBe("number");
    expect(out.priceQuoted).toBe(165.81);
    expect(out.fareSubtotal).toBe(140);
  });

  it("falls back to priceQuoted when fareSubtotal is absent, still as a number", () => {
    const out = serializeBooking(row({ fareSubtotal: null }));
    expect(out.fareSubtotal).toBe(165.81);
    expect(typeof out.fareSubtotal).toBe("number");
  });

  it("keeps nullable money columns null rather than coercing them to 0", () => {
    const out = serializeBooking(row({ discountAmount: null, tipAmount: null }));
    expect(out.discountAmount).toBeNull();
    expect(out.tipAmount).toBeNull();
  });

  it("emits timestamps as ISO strings", () => {
    const out = serializeBooking(row({ authorizedAt: new Date("2026-08-02T09:30:00Z") }));
    expect(out.pickupAt).toBe("2026-08-22T12:00:00.000Z");
    expect(out.createdAt).toBe("2026-08-01T00:00:00.000Z");
    expect(out.authorizedAt).toBe("2026-08-02T09:30:00.000Z");
  });

  it("leaves authorizedAt null when the booking was never authorized", () => {
    expect(serializeBooking(row()).authorizedAt).toBeNull();
  });

  it("survives a row where priceQuoted itself is missing", () => {
    const out = serializeBooking(row({ priceQuoted: null as never, fareSubtotal: null }));
    expect(out.priceQuoted).toBe(0);
    expect(out.fareSubtotal).toBe(0);
  });
});
