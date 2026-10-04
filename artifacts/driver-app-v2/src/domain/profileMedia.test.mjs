import assert from "node:assert/strict";
import test from "node:test";

import { needsPrivateSigning } from "./profileMedia.ts";

test("private profile object paths require a signed URL while signed/public URLs do not", () => {
  assert.equal(needsPrivateSigning("/objects/uploads/profile.jpg"), true);
  assert.equal(needsPrivateSigning("/storage/objects/uploads/profile.jpg?exp=1&sig=x"), false);
  assert.equal(needsPrivateSigning("https://cdn.example/profile.jpg"), false);
  assert.equal(needsPrivateSigning(null), false);
});
