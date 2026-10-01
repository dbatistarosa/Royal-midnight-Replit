import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const migrationFilename = /^(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

export function normalizeSql(sql) {
  return sql.replaceAll("\r", "").trim();
}

export function checksumSql(sql) {
  return createHash("sha256").update(normalizeSql(sql)).digest("hex");
}

export function buildMigrationManifest(files) {
  const versions = new Set();
  const names = new Set();

  return [...files]
    .sort((left, right) => left.file.localeCompare(right.file))
    .map(({ file, sql }) => {
      const match = file.match(migrationFilename);
      if (!match) throw new Error(`Invalid migration filename: ${file}`);

      const [, version, name] = match;
      if (versions.has(version)) {
        throw new Error(`Duplicate migration version: ${version}`);
      }
      if (names.has(name)) throw new Error(`Duplicate migration name: ${name}`);

      const source = normalizeSql(sql);
      if (!source) throw new Error(`Empty migration: ${file}`);

      versions.add(version);
      names.add(name);
      return { file, version, name, source, checksum: checksumSql(source) };
    });
}

export async function loadMigrationManifest(directory) {
  const files = (await fs.readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .map(async (file) => ({
      file,
      sql: await fs.readFile(path.join(directory, file), "utf8"),
    }));

  return buildMigrationManifest(await Promise.all(files));
}
