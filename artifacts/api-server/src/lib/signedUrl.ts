import crypto from "crypto";

/**
 * Short-lived signed URLs for private object downloads.
 *
 * Private objects (driver licences, insurance, vehicle registrations) are shown
 * in the admin UI with plain <img src> and <a href>, and browsers do not attach
 * an Authorization header to those. Requiring a bearer token on the download
 * route would therefore break document review, while leaving the route open
 * means anyone who learns a UUID can read a driver's licence (CN-003).
 *
 * A signature solves both: the caller must hold a valid session to *mint* the
 * URL, but the URL itself then works in an ordinary tag and expires on its own.
 */

const DEFAULT_TTL_SECONDS = 10 * 60;

/** Signing key. Prefers a dedicated SESSION_SECRET; falls back to a value
 *  derived from DATABASE_URL so signing works without extra configuration.
 *  The fallback is high-entropy and already secret, but setting SESSION_SECRET
 *  is preferred so rotating the database password does not invalidate URLs. */
function getSigningKey(): Buffer {
  const explicit = process.env.SESSION_SECRET;
  if (explicit && explicit.length >= 16 && !explicit.startsWith("change-me")) {
    return Buffer.from(explicit, "utf8");
  }

  const fallbackMaterial = process.env.DATABASE_URL;
  if (!fallbackMaterial) {
    throw new Error("Cannot sign object URLs: set SESSION_SECRET (or DATABASE_URL)");
  }
  // Domain-separated so this derived key can never collide with any other use
  // of the same material.
  return crypto.createHash("sha256").update(`rm:object-url:${fallbackMaterial}`).digest();
}

function computeSignature(objectPath: string, exp: number): string {
  return crypto
    .createHmac("sha256", getSigningKey())
    .update(`${objectPath}:${exp}`)
    .digest("hex");
}

export interface SignedObjectUrl {
  exp: number;
  sig: string;
}

/** Mint a signature for an object path, valid for `ttlSeconds`. */
export function signObjectPath(objectPath: string, ttlSeconds: number = DEFAULT_TTL_SECONDS): SignedObjectUrl {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return { exp, sig: computeSignature(objectPath, exp) };
}

/** Constant-time check of a signature against an object path. */
export function verifyObjectSignature(objectPath: string, rawExp: unknown, rawSig: unknown): boolean {
  if (typeof rawSig !== "string" || !rawSig) return false;

  const exp = Number(rawExp);
  if (!Number.isFinite(exp)) return false;
  if (exp < Math.floor(Date.now() / 1000)) return false;

  const expected = computeSignature(objectPath, exp);
  const provided = Buffer.from(rawSig, "utf8");
  const reference = Buffer.from(expected, "utf8");
  if (provided.length !== reference.length) return false;

  try {
    return crypto.timingSafeEqual(provided, reference);
  } catch {
    return false;
  }
}
