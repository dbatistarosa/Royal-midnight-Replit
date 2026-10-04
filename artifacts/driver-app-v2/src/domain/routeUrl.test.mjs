import assert from "node:assert/strict";
import test from "node:test";

import { buildExternalMapsUrl } from "./routeUrl.ts";

test("external Maps route includes ordered hourly stops as waypoints", () => {
  const url = buildExternalMapsUrl({
    pickup: "Pickup, FL",
    stops: ["Stop A, FL", "Stop B, FL"],
    dropoff: "Airport, FL",
  });

  assert.equal(
    url,
    "https://www.google.com/maps/dir/?api=1&origin=Pickup%2C%20FL&destination=Airport%2C%20FL&travelmode=driving&waypoints=Stop%20A%2C%20FL%7CStop%20B%2C%20FL",
  );
});

test("external Maps route omits waypoints for a transfer", () => {
  assert.equal(
    buildExternalMapsUrl({ pickup: "Pickup", stops: [], dropoff: "Drop-off" }),
    "https://www.google.com/maps/dir/?api=1&origin=Pickup&destination=Drop-off&travelmode=driving",
  );
});
