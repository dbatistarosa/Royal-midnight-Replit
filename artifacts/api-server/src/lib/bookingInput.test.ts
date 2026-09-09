import { describe, it, expect } from "vitest";
import { ValidatedBookingBody } from "./bookingInput";
const booking = {
  passengerName: "QA",
  passengerEmail: " TEST@EXAMPLE.COM ",
  passengerPhone: "+12025550199",
  pickupAddress: "MIA",
  dropoffAddress: "Miami Beach",
  pickupAt: "2026-10-12T12:00:00-04:00",
  vehicleClass: "business",
  passengers: 1,
  priceQuoted: 100,
};
describe("booking manifest validation", () => {
  it("normalizes email before reservation ownership is stored", () =>
    expect(ValidatedBookingBody.parse(booking).passengerEmail).toBe(
      "test@example.com",
    ));
  it.each([-1, 0, 1.5, 21])("rejects passenger count %s", (passengers) =>
    expect(
      ValidatedBookingBody.safeParse({ ...booking, passengers }).success,
    ).toBe(false),
  );
  it.each([-1, 0, 0.5, 21])("rejects extra quantity %s", (quantity) =>
    expect(
      ValidatedBookingBody.safeParse({
        ...booking,
        extras: [{ id: 1, quantity }],
      }).success,
    ).toBe(false),
  );
  it("rejects duplicate extras rather than silently dropping one charge", () =>
    expect(
      ValidatedBookingBody.safeParse({
        ...booking,
        extras: [
          { id: 1, quantity: 1 },
          { id: 1, quantity: 2 },
        ],
      }).success,
    ).toBe(false));
  it("requires a real timestamp with timezone", () =>
    expect(
      ValidatedBookingBody.safeParse({ ...booking, pickupAt: "tomorrow" })
        .success,
    ).toBe(false));
  it("defaults an omitted quantity to one", () =>
    expect(
      ValidatedBookingBody.parse({ ...booking, extras: [{ id: 1 }] })
        .extras?.[0].quantity,
    ).toBe(1));
});
