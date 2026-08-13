import { drizzle } from "drizzle-orm/node-postgres";
import tls from "node:tls";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// CN-010 — verify the database server's TLS certificate.
//
// This connection carries password hashes, session tokens, encrypted PII and
// payment metadata. It used to open with rejectUnauthorized:false, which means
// anyone able to sit on the network path or poison DNS for the Supabase host
// could read and rewrite all of it.
//
// Supabase signs with its own CA for direct connections, so the trust store is
// the Node defaults PLUS that CA when supplied. Concatenating rather than
// replacing matters: passing `ca` alone drops every public root, which breaks
// the Supavisor pooler if it ever presents a publicly-trusted certificate.
// Either shape verifies successfully with this configuration.
//
// SUPABASE_CA_CERT holds the PEM from Supabase → Settings → Database → SSL
// Configuration. Dashboard env vars mangle real newlines, so \n escapes are
// accepted too.
function buildSsl(): { rejectUnauthorized: boolean; ca?: string[] } | undefined {
  if (!process.env.DATABASE_URL?.includes("supabase")) return undefined;

  const raw = process.env.SUPABASE_CA_CERT?.trim();

  // Without the CA there is nothing to verify against: Supabase signs with its
  // own root, so demanding verification here rejects every connection and takes
  // the whole API down with 500s — which is exactly what happened when this was
  // first shipped. Falling back keeps the service up, and the warning is what
  // gets it fixed properly.
  if (!raw) {
    console.warn(
      "[db] SUPABASE_CA_CERT is not set — TLS certificate verification is DISABLED (CN-010). " +
      "Paste the certificate from Supabase → Settings → Database → SSL Configuration " +
      "into the SUPABASE_CA_CERT environment variable to close this.",
    );
    return { rejectUnauthorized: false };
  }

  // Concatenate rather than replace: passing `ca` alone drops every public root,
  // which would break the pooler if it presents a publicly-trusted certificate.
  return { rejectUnauthorized: true, ca: [raw.replace(/\\n/g, "\n"), ...tls.rootCertificates] };
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSsl(),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
