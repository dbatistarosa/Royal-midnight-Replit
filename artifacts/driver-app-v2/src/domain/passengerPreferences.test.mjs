import assert from "node:assert/strict";
import test from "node:test";

import { formatPassengerPreferenceRows } from "./passengerPreferences.ts";

test("driver preference rows include the saved preferences and normalize door-service copy", () => {
  assert.deepEqual(
    formatPassengerPreferenceRows({
      addressTitle: "Mr.",
      cabinTempF: 74,
      musicPreference: "Silence",
      quietRide: true,
      preferredBeverage: null,
      opensOwnDoor: false,
      vipNotes: null,
    }),
    [
      "Address as: Mr.",
      "Cabin temp: 74°F",
      "Music: Silence",
      "Quiet ride: Prefers minimal conversation",
      "Door service: Driver opens door",
    ],
  );
});

test("empty passenger preferences render no rows", () => {
  assert.deepEqual(formatPassengerPreferenceRows(null), []);
});
