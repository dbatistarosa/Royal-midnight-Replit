import assert from "node:assert/strict";
import test from "node:test";
import { hasPassengerPreferences, normalizePassengerEmail } from "./driverBookingView.ts";

test("passenger email lookup is normalized exactly", () => {
  assert.equal(normalizePassengerEmail("  Eliot@Example.COM "), "eliot@example.com");
  assert.equal(normalizePassengerEmail(" "), null);
});

test("driver preferences keep explicit door-service choices", () => {
  assert.equal(hasPassengerPreferences({ opensOwnDoor: false }), true);
});

test("driver preferences stay empty when every field is unset", () => {
  assert.equal(hasPassengerPreferences({ opensOwnDoor: null, quietRide: false }), false);
});
