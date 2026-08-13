import bcrypt from "bcrypt";
import crypto from "crypto";

const ROUNDS = 12;

// Legacy scheme: one SHA-256 pass with a constant that is committed to source.
// A global constant is functionally no salt at all — a single rainbow table
// cracks every account still using it, at GPU speed. These are upgraded to
// bcrypt on the next successful login (see routes/auth.ts), and this branch can
// be deleted once `SELECT count(*) FROM users WHERE password_hash ~
// '^[0-9a-f]{64}$'` reaches zero (CN-012).
const OLD_SALT = "royal_midnight_salt";
const LEGACY_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, ROUNDS);
}

/** True when the stored hash still uses the deprecated SHA-256 scheme. */
export function isLegacyHash(hash: string): boolean {
  return LEGACY_HASH_PATTERN.test(hash);
}

export function verifyPassword(password: string, hash: string): boolean {
  if (isLegacyHash(hash)) {
    // Constant-time compare — a plain === on the hex digest leaks the matching
    // prefix length through timing. bcrypt.compareSync is already constant-time.
    const computed = crypto.createHash("sha256").update(password + OLD_SALT).digest();
    const stored = Buffer.from(hash, "hex");
    return computed.length === stored.length && crypto.timingSafeEqual(computed, stored);
  }
  return bcrypt.compareSync(password, hash);
}

export function isValidHash(value: string): boolean {
  return value.length > 20;
}
