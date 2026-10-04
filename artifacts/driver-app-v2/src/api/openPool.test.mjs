import test from "node:test";
import assert from "node:assert/strict";

import { findOpenPoolBooking, uniqueBookingsById } from "./openPool.ts";

test("open-pool bookings contain each booking id only once", () => {
  const first = { id: 41, status: "pending", pickupAddress: "FLL" };
  const duplicate = { id: 41, status: "pending", pickupAddress: "FLL duplicate" };
  const second = { id: 52, status: "confirmed", pickupAddress: "MIA" };

  assert.deepEqual(uniqueBookingsById([first, duplicate, second]), [first, second]);
});

test("offer detail is selected from the same secured open pool", () => {
  const bookings = [{ id: 7 }, { id: 9 }];
  assert.equal(findOpenPoolBooking(bookings, 9), bookings[1]);
  assert.equal(findOpenPoolBooking(bookings, 10), null);
  assert.equal(findOpenPoolBooking(bookings, Number.NaN), null);
});
