import { expect, it } from "vitest";
import { hasPassengerPreferences, normalizePassengerEmail } from "./driverBookingView.ts";

it("passenger email lookup is normalized exactly", () => {
  expect(normalizePassengerEmail("  Eliot@Example.COM ")).toBe("eliot@example.com");
  expect(normalizePassengerEmail(" ")).toBeNull();
});

it("driver preferences keep explicit door-service choices", () => {
  expect(hasPassengerPreferences({ opensOwnDoor: false })).toBe(true);
});

it("driver preferences stay empty when every field is unset", () => {
  expect(
    hasPassengerPreferences({ opensOwnDoor: null, quietRide: false }),
  ).toBe(false);
});
