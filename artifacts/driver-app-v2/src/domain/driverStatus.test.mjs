import test from "node:test";
import assert from "node:assert/strict";
import { canChangeAvailability, displayDriverStatus } from "./driverStatus.ts";

test("active trips display as On Duty", () => {
  assert.equal(displayDriverStatus("available", true), "on_duty");
  assert.equal(displayDriverStatus("active", false), "available");
  assert.equal(displayDriverStatus("on_break", false), "on_break");
});

test("break and unavailable are disabled during a live trip", () => {
  assert.equal(canChangeAvailability("available", true), true);
  assert.equal(canChangeAvailability("on_break", true), false);
  assert.equal(canChangeAvailability("unavailable", true), false);
});
