import assert from "node:assert/strict";
import test from "node:test";

import {
  actionForTrip,
  canGoOnWay,
  canCompleteHourlyTrip,
  formatOnWayAvailability,
  nextItineraryAction,
} from "./driverWorkflow.ts";

const config = { confirmWindowMinutes: 120, releaseMinutes: 45, graceMinutes: 75 };

test("On My Way is available at the configured boundary, never from a hard-coded timer", () => {
  const now = Date.parse("2026-09-29T12:00:00.000Z");
  assert.equal(canGoOnWay({ status: "confirmed", checklistCompletedAt: "done", pickupAt: "2026-09-29T14:00:00.000Z" }, config, now), true);
  assert.equal(canGoOnWay({ status: "confirmed", checklistCompletedAt: "done", pickupAt: "2026-09-29T14:01:00.000Z" }, config, now), false);
  assert.match(formatOnWayAvailability(121, config), /1 minute/);
});

test("trip actions follow the server state machine", () => {
  assert.equal(actionForTrip({ status: "confirmed", checklistCompletedAt: null }), "checklist");
  assert.equal(actionForTrip({ status: "confirmed", checklistCompletedAt: "done" }), "on_way");
  assert.equal(actionForTrip({ status: "on_way" }), "on_location");
  assert.equal(actionForTrip({ status: "on_location" }), "start");
  assert.equal(actionForTrip({ status: "in_progress" }), "complete");
});

test("hourly itinerary exposes the next required stop action", () => {
  assert.deepEqual(nextItineraryAction([{ sequence: 0, arrivedAt: null, departedAt: null }]), { sequence: 0, action: "arrive" });
  assert.deepEqual(nextItineraryAction([{ sequence: 0, arrivedAt: "a", departedAt: null }]), { sequence: 0, action: "depart" });
  assert.equal(nextItineraryAction([{ sequence: 0, arrivedAt: "a", departedAt: "d" }]), null);
});

test("hourly completion stays blocked when the route itinerary is missing", () => {
  assert.equal(canCompleteHourlyTrip([]), false);
  assert.equal(canCompleteHourlyTrip(undefined), false);
});

test("hourly final destination is arrived at once and never departed", () => {
  const route = [
    { sequence: 0, kind: "stop", arrivedAt: "stop-arrival", departedAt: "stop-departure" },
    { sequence: 1, kind: "final", arrivedAt: null, departedAt: null },
  ];
  assert.deepEqual(nextItineraryAction(route), { sequence: 1, action: "arrive" });
  assert.equal(canCompleteHourlyTrip(route), false);

  const atFinal = [...route];
  atFinal[1] = { ...atFinal[1], arrivedAt: "final-arrival" };
  assert.equal(nextItineraryAction(atFinal), null);
  assert.equal(canCompleteHourlyTrip(atFinal), true);
});
