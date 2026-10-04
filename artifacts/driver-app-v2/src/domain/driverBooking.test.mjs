import assert from "node:assert/strict";
import test from "node:test";

import { filterCompatibleVehicles, serviceLabel } from "./driverBooking.ts";

test("service labels distinguish airport, transfer and hourly rides", () => {
  assert.equal(serviceLabel({ charterMode: "hourly", flightNumber: null }), "Hourly Charter");
  assert.equal(serviceLabel({ charterMode: "route", flightNumber: "AA42" }), "Airport Transfer");
  assert.equal(serviceLabel({ charterMode: null, flightNumber: null }), "Chauffeur Transfer");
});

test("vehicle filtering respects class, passenger and luggage capacity", () => {
  const vehicles = [
    { id: 1, vehicleClass: "business", passengerCapacity: 3, luggageCapacity: 2 },
    { id: 2, vehicleClass: "suv", passengerCapacity: 6, luggageCapacity: 5 },
  ];
  assert.deepEqual(filterCompatibleVehicles(vehicles, { vehicleClass: "suv", passengers: 4, luggageCount: 3 }).map(v => v.id), [2]);
  assert.deepEqual(filterCompatibleVehicles(vehicles, { vehicleClass: "business", passengers: 4, luggageCount: 1 }).map(v => v.id), []);
});
