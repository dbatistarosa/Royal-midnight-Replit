import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMigrationManifest,
  checksumSql,
  normalizeSql,
} from "./migration-manifest.mjs";

test("sorts valid migrations by filename", () => {
  const manifest = buildMigrationManifest([
    { file: "20260902000000_second.sql", sql: "select 2;" },
    { file: "20260901000000_first.sql", sql: "select 1;" },
  ]);

  assert.deepEqual(
    manifest.map(({ file, version, name, source }) => ({
      file,
      version,
      name,
      source,
    })),
    [
      {
        file: "20260901000000_first.sql",
        version: "20260901000000",
        name: "first",
        source: "select 1;",
      },
      {
        file: "20260902000000_second.sql",
        version: "20260902000000",
        name: "second",
        source: "select 2;",
      },
    ],
  );
});

test("normalizes CRLF and surrounding whitespace before checksumming", () => {
  const crlf = "\r\n  select 1;\r\n";
  const lf = "select 1;\n";

  assert.equal(normalizeSql(crlf), "select 1;");
  assert.equal(checksumSql(crlf), checksumSql(lf));
});

test("rejects an invalid migration filename", () => {
  assert.throws(
    () => buildMigrationManifest([{ file: "001_bad.sql", sql: "select 1;" }]),
    { message: "Invalid migration filename: 001_bad.sql" },
  );
});

test("rejects duplicate migration versions", () => {
  assert.throws(
    () =>
      buildMigrationManifest([
        { file: "20260901000000_first.sql", sql: "select 1;" },
        { file: "20260901000000_second.sql", sql: "select 2;" },
      ]),
    { message: "Duplicate migration version: 20260901000000" },
  );
});

test("rejects duplicate migration names", () => {
  assert.throws(
    () =>
      buildMigrationManifest([
        { file: "20260901000000_same.sql", sql: "select 1;" },
        { file: "20260902000000_same.sql", sql: "select 2;" },
      ]),
    { message: "Duplicate migration name: same" },
  );
});

test("rejects empty normalized SQL", () => {
  assert.throws(
    () =>
      buildMigrationManifest([
        { file: "20260901000000_empty.sql", sql: " \r\n\t " },
      ]),
    { message: "Empty migration: 20260901000000_empty.sql" },
  );
});
