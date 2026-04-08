import crypto from "crypto";

const SALT = "royal_midnight_salt";

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + SALT).digest("hex");
}

export function isValidHash(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
