import assert from "node:assert/strict";
import test from "node:test";
import {
  driverInitials,
  driverPayoutTotal,
  filterRides,
  notificationCategory,
  vehicleClassLabel,
} from "./driverPresentation.ts";

test("ride tabs isolate cancelled/completed and search both route stops", () => {
  const trips = [
    { id: 1, status: "confirmed", pickupAddress: "Airport", dropoffAddress: "Hotel", pickupAt: "2026-10-01" },
    { id: 2, status: "completed", pickupAddress: "Marina", dropoffAddress: "Airport", pickupAt: "2026-09-01" },
    { id: 3, status: "cancelled", pickupAddress: "Home", dropoffAddress: "Hotel", pickupAt: "2026-09-02" },
  ];
  assert.deepEqual(filterRides(trips, "upcoming", " HOTEL ").map(x => x.id), [1]);
  assert.deepEqual(filterRides(trips, "completed", "airport").map(x => x.id), [2]);
  assert.deepEqual(filterRides(trips, "cancelled", "").map(x => x.id), [3]);
  assert.equal(filterRides(trips, "upcoming", "missing").length, 0);
});

test("notification filters keep document notices and booking links distinct", () => {
  assert.equal(notificationCategory({ type: "document_approved", bookingId: null }), "documents");
  assert.equal(notificationCategory({ type: "new_ride", bookingId: 42 }), "bookings");
  assert.equal(notificationCategory({ type: "system", bookingId: null }), "system");
});

test("profile fallbacks present names and stored vehicle classes cleanly", () => {
  assert.equal(driverInitials("Darwin Batista"), "DB");
  assert.equal(driverInitials("  Darwin  "), "D");
  assert.equal(driverInitials(""), "RM");
  assert.equal(vehicleClassLabel("business"), "Business");
  assert.equal(vehicleClassLabel("executive_suv"), "Executive Suv");
});

test("completed-trip total is the chauffeur payout plus tip, not passenger price", () => {
  assert.equal(driverPayoutTotal(120.25, 30), 150.25);
  assert.equal(driverPayoutTotal(120.25, null), 120.25);
});
