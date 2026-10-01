import { describe, expect, it } from "vitest";
import { driverOvertimeFareForBooking, enrichDriverBooking, hasPassengerPreferences, maskOpenPoolBooking, normalizePassengerEmail, toDriverView } from "./driverBookingView.js";

describe("driver booking view", () => {
  it("normalizes passenger email matches without changing the stored value", () => {
    expect(normalizePassengerEmail("  Eliot@Example.COM ")).toBe("eliot@example.com");
    expect(normalizePassengerEmail(" ")).toBeNull();
  });
  it("keeps an explicit door-service preference even when its value is false", () => {
    expect(hasPassengerPreferences({
      cabinTempF: null,
      musicPreference: null,
      quietRide: false,
      preferredBeverage: null,
      opensOwnDoor: false,
      addressTitle: null,
      vipNotes: null,
    })).toBe(true);
  });

  it("does not invent preferences when every optional field is empty", () => {
    expect(hasPassengerPreferences({
      cabinTempF: null,
      musicPreference: null,
      quietRide: false,
      preferredBeverage: null,
      opensOwnDoor: null,
      addressTitle: null,
      vipNotes: null,
    })).toBe(false);
  });

  it("uses the server commission basis and keeps paid extras separate", () => {
    const view = toDriverView({
      priceQuoted: 500,
      fareSubtotal: 300,
      commissionPct: null,
      passengerName: "A",
      hourlyRate: 125,
      extraMileRate: 2,
      extraCharge: 250,
      totalPrice: 750,
    }, 0.7, { driverExtras: 40, overtimeFare: 50 });
    expect(view.driverFareEarnings).toBe(210);
    expect(view.driverOvertimeEarnings).toBe(35);
    expect(view.driverExtrasEarnings).toBe(40);
    expect(view.driverEarnings).toBe(285);
    expect("priceQuoted" in view).toBe(false);
    expect("hourlyRate" in view).toBe(false);
    expect("extraMileRate" in view).toBe(false);
    expect("extraCharge" in view).toBe(false);
    expect("totalPrice" in view).toBe(false);
  });

  it("enriches list and detail with one related-data shape", () => {
    const enriched = enrichDriverBooking({ id: 7 }, { extras: [{ id: 1 }], itinerary: [{ sequence: 0 }], passengerPreferences: null });
    expect(enriched).toMatchObject({ id: 7, extras: [{ id: 1 }], itinerary: [{ sequence: 0 }], passengerPreferences: null });
  });

  it("masks every sensitive open-pool field", () => {
    const masked = maskOpenPoolBooking({ passengerName: "Maria Gonzalez", passengerEmail: "private@example.com" }, "Maria Gonzalez");
    expect(masked.passengerName).toBe("Maria G.");
    expect(masked.passengerEmail).toBeNull();
    expect(masked.passengerPhone).toBeNull();
    expect(masked.specialRequests).toBeNull();
    expect(masked.passengerPreferences).toBeNull();
  });

  it("does not expose overtime payout before the trip is completed", () => {
    expect(driverOvertimeFareForBooking({ status: "in_progress" }, 75, 120)).toBe(0);
    expect(driverOvertimeFareForBooking({ status: "completed" }, 75, 120)).toBe(75);
    expect(driverOvertimeFareForBooking({ status: "completed" }, null, 120)).toBe(120);
  });
});
