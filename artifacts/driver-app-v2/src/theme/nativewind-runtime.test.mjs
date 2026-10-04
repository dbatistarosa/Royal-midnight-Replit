import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import test from "node:test";

const appRequire = createRequire(import.meta.url);
const nativewindRequire = createRequire(appRequire.resolve("nativewind/package.json"));

test("Metro style injection and NativeWind JSX use the same native style registry", () => {
  const runtime = "react-native-css-interop/dist/runtime/native/styles";
  assert.equal(
    realpathSync(nativewindRequire.resolve(runtime)),
    realpathSync(appRequire.resolve(runtime)),
    "Two CSS interop installations split style injection from className lookup, leaving native screens unstyled",
  );
});
