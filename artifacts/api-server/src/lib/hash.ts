import crypto from "crypto";
import bcrypt from "bcrypt";

const SHA256_SALT = "royal_midnight_salt";
const BCRYPT_ROUNDS = 10;

/** Hash a plain-text password with bcrypt (async). */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a plain-text password against a stored hash.
 * Accepts both bcrypt ($2b$...) and legacy SHA-256 (64-char hex) hashes.
 * Returns { valid: boolean; needsRehash: boolean }
 */
export async function verifyPassword(
  plain: string,
  storedHash: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (storedHash.startsWith("$2b$") || storedHash.startsWith("$2a$")) {
    const valid = await bcrypt.compare(plain, storedHash);
    return { valid, needsRehash: false };
  }
  const sha256 = crypto.createHash("sha256").update(plain + SHA256_SALT).digest("hex");
  const valid = sha256 === storedHash;
  return { valid, needsRehash: valid };
}

/**
 * Returns true for valid bcrypt or SHA-256 password hashes.
 * Used by the startup hash-fix loop to avoid re-hashing bcrypt hashes.
 */
export function isValidHash(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value) || value.startsWith("$2b$") || value.startsWith("$2a$");
}
