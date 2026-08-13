import { drizzle } from "drizzle-orm/node-postgres";
import tls from "node:tls";
import pg from "pg";
import * as schema from "./schema";
import { SUPABASE_ROOT_CA_2021 } from "./supabaseCa";

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

  // DB_TLS_INSECURE=1 is the escape hatch. If Supabase ever rotates its root and
  // connections start failing with SELF_SIGNED_CERT_IN_CHAIN, setting this in
  // Vercel restores service in one redeploy without a code change. It is not the
  // default, because the default silently unverified is how this started.
  if (process.env.DB_TLS_INSECURE === "1") {
    console.warn("[db] DB_TLS_INSECURE=1 — TLS certificate verification is DISABLED (CN-010).");
    return { rejectUnauthorized: false };
  }

  // An override always wins, so a rotated certificate can be fixed from the
  // dashboard. Dashboard env vars mangle real newlines, so \n escapes are fine.
  const override = process.env.SUPABASE_CA_CERT?.trim();
  const ca = override ? override.replace(/\\n/g, "\n") : SUPABASE_ROOT_CA_2021;

  // Concatenate rather than replace: passing `ca` alone drops every public root,
  // which would break the pooler if it presents a publicly-trusted certificate.
  // With both, verification succeeds whichever way the host is signed.
  return { rejectUnauthorized: true, ca: [ca, ...tls.rootCertificates] };
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSsl(),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
