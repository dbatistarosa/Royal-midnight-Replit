import test from "node:test";
import assert from "node:assert/strict";

import { shouldDiscardStoredSession } from "./sessionHydration.ts";

test("only authentication failures discard a stored mobile session", () => {
  assert.equal(shouldDiscardStoredSession(401), true);
  assert.equal(shouldDiscardStoredSession(403), true);
  assert.equal(shouldDiscardStoredSession(500), false);
  assert.equal(shouldDiscardStoredSession(null), false);
});
