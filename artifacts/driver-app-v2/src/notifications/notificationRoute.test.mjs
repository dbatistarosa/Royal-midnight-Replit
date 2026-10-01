import test from "node:test";
import assert from "node:assert/strict";

import { notificationRoute } from "./notificationRoute.ts";

test("new ride offer notifications open the secured offer screen", () => {
  assert.equal(notificationRoute({ type: "new_ride_offer", bookingId: 81 }), "/offer/81?returnTo=alerts");
});

test("assigned trip notifications open the assigned trip screen", () => {
  assert.equal(notificationRoute({ type: "trip_assigned", bookingId: "82" }), "/trip/82?returnTo=alerts");
});

test("invalid notification data falls back to the alerts list", () => {
  assert.equal(notificationRoute({ type: "new_ride_offer", bookingId: "not-a-number" }), "/(app)/notifications");
  assert.equal(notificationRoute(undefined), "/(app)/notifications");
});
