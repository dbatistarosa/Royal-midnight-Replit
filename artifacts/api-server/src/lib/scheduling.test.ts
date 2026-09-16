import { describe, it, expect } from "vitest";
import { tripConflicts, vehicleClassCovers, vehicleFits } from "./scheduling";
const trip = (time: string, duration = 60) => ({
  pickupAt: `2026-09-08T${time}:00Z`,
  estimatedDurationMinutes: duration,
});
describe("driver scheduling", () => {
  it("rejects a new journey beginning before a later trip but ending during it", () =>
    expect(tripConflicts(trip("08:00", 240), [trip("11:00")])).toBe(true));
  it("reserves all contracted charter hours, even with a short route", () =>
    expect(
      tripConflicts(trip("13:00"), [
        { ...trip("09:00", 20), charterMode: "hourly", charterHours: 5 },
      ]),
    ).toBe(true));
  it("allows back-to-back work after the complete transfer buffer", () =>
    expect(tripConflicts(trip("11:00"), [trip("09:00")])).toBe(false));
  it("is symmetric when the order of acceptance changes", () =>
    expect(tripConflicts(trip("11:00"), [trip("08:00", 240)])).toBe(
      tripConflicts(trip("08:00", 240), [trip("11:00")]),
    ));
  it("rejects an undersized or wrong-class vehicle", () => {
    const booking = { vehicleClass: "suv", passengers: 5, luggageCount: 3 };
    expect(
      vehicleFits(
        { vehicleClass: "suv", passengerCapacity: 4, luggageCapacity: 4 },
        booking,
      ),
    ).toBe(false);
    expect(
      vehicleFits(
        { vehicleClass: "standard", passengerCapacity: 6, luggageCapacity: 4 },
        booking,
      ),
    ).toBe(false);
    expect(
      vehicleFits(
        { vehicleClass: "suv", passengerCapacity: 6, luggageCapacity: 4 },
        booking,
      ),
    ).toBe(true);
  });
  it("lets a Premium SUV cover Classic Sedan, but never the reverse", () => {
    expect(vehicleClassCovers("suv", "business")).toBe(true);
    expect(vehicleClassCovers("business", "suv")).toBe(false);
    expect(vehicleFits(
      { vehicleClass: "suv", passengerCapacity: 6, luggageCapacity: 6 },
      { vehicleClass: "business", passengers: 3, luggageCount: 3 },
    )).toBe(true);
  });
});
