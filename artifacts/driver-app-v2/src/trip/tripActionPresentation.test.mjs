import assert from "node:assert/strict";
import test from "node:test";

import {
  CHECKLIST_ITEMS,
  formatTripActionError,
  nextTripAction,
} from "./tripActionPresentation.ts";

test("a confirmed trip starts with the checklist and only then exposes On the Way", () => {
  assert.equal(nextTripAction("confirmed", null), "checklist");
  assert.equal(nextTripAction("confirmed", "2026-09-29T12:00:00.000Z"), "on_way");
});

test("the driver checklist contains the five required pre-ride checks", () => {
  assert.equal(CHECKLIST_ITEMS.length, 5);
  assert.ok(CHECKLIST_ITEMS.every((item) => item.length > 0));
});

test("server error details are preserved for a recoverable trip action", () => {
  assert.equal(
    formatTripActionError({ status: 400, message: "On the Way can only be activated within 120 minutes of pickup" }),
    "On the Way can only be activated within 120 minutes of pickup",
  );
  assert.equal(formatTripActionError(new TypeError("Failed to fetch")), "Could not reach the server. Check your connection and try again.");
  assert.equal(formatTripActionError(new Error("unexpected")), "Could not update this trip. Please try again.");
});
