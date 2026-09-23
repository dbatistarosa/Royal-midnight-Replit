import assert from "node:assert/strict";
import { applyOnlineTransition } from "./locationLifecycle.ts";

const calls = [];
let rejected = false;

try {
  await applyOnlineTransition({
    startLocation: async () => {
      calls.push("start-location");
      return true;
    },
    stopLocation: async () => {
      calls.push("stop-location");
    },
    setStatus: async () => {
      calls.push("set-available");
      throw new Error("status request failed");
    },
  });
} catch (error) {
  rejected = error instanceof Error && error.message === "status request failed";
}

assert.equal(rejected, true, "the status error must be rethrown");
assert.deepEqual(calls, ["start-location", "set-available", "stop-location"]);
