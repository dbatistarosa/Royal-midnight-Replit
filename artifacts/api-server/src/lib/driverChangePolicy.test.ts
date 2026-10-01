import { describe, expect, it } from "vitest";
import { canDriverEditVehicle, vehicleEditDaysRemaining } from "./driverChangePolicy.js";

const today = new Date("2026-09-30T12:00:00Z");

describe("driver vehicle edit policy", () => {
  it("allows changes from today through the 30-day renewal window", () => {
    expect(vehicleEditDaysRemaining("2026-09-30", today)).toBe(0);
    expect(canDriverEditVehicle("2026-10-30", today)).toBe(true);
    expect(canDriverEditVehicle("2026-10-31", today)).toBe(false);
  });

  it("denies missing, malformed, and expired dates", () => {
    expect(canDriverEditVehicle(null, today)).toBe(false);
    expect(canDriverEditVehicle("not-a-date", today)).toBe(false);
    expect(canDriverEditVehicle("2026-09-29", today)).toBe(false);
  });
});
