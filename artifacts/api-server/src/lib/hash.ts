import bcrypt from "bcrypt";
import crypto from "crypto";

const ROUNDS = 12;
const OLD_SALT = "royal_midnight_salt";

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, ROUNDS);
}

export function isLegacyHash(hash: string): boolean {
  return /^[0-9a-f]{64}$/.test(hash);
}

export function verifyPassword(password: string, hash: string): boolean {
  // Support legacy SHA256 hashes so existing users can still log in (re-hashed to bcrypt on next login)
  if (isLegacyHash(hash)) {
    return crypto.createHash("sha256").update(password + OLD_SALT).digest("hex") === hash;
  }
  return bcrypt.compareSync(password, hash);
}

export function isValidHash(value: string): boolean {
  return value.length > 20;
}
