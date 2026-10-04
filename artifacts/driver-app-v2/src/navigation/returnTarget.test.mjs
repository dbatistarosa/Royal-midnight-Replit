import test from "node:test";
import assert from "node:assert/strict";
import { buildTripHref, returnRouteForTrip } from "./returnTarget.ts";

test("trip links preserve the list that opened the ride", () => {
  assert.equal(buildTripHref(42, "completed"), "/trip/42?returnTo=completed");
  assert.equal(buildTripHref(42, "alerts"), "/trip/42?returnTo=alerts");
});

test("unknown return targets fall back to the rides home", () => {
  assert.equal(returnRouteForTrip("completed"), "/(app)/trips?tab=completed");
  assert.equal(returnRouteForTrip("cancelled"), "/(app)/trips?tab=cancelled");
  assert.equal(returnRouteForTrip("unknown"), "/(app)");
  assert.equal(returnRouteForTrip(undefined), "/(app)");
});
