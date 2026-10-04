import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const configUrl = new URL("../vite.config.ts", import.meta.url);

test("Vite deduplicates React Query across web and mobile workspaces", async () => {
  const source = await readFile(configUrl, "utf8");
  const dedupeArray = source.match(/dedupe\s*:\s*\[([^\]]*)\]/s)?.[1];

  assert.ok(dedupeArray, "vite.config.ts must define resolve.dedupe");
  assert.match(
    dedupeArray,
    /["']@tanstack\/react-query["']/,
    "resolve.dedupe must include @tanstack/react-query",
  );
});
