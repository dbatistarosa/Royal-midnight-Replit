import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_ENV = "FIELD_ENCRYPTION_KEY";

let _warnedMissingKey = false;

/**
 * A malformed key is a deployment problem, not a request problem.
 *
 * It used to surface as a bare Error from getKey(), which the express error
 * handler turned into a flat `500 {"error":"Internal server error"}`. Saving
 * driver bank details had been failing that way in production — the admin saw
 * "Could not save bank details", the real reason ("FIELD_ENCRYPTION_KEY must be
 * exactly 32 bytes") was only in the Vercel logs, and nothing on the screen
 * pointed at the environment variable that actually needed fixing.
 *
 * Its own type so the routes that write encrypted fields can answer 503 with
 * something the operator can act on, while still never echoing the key itself.
 */
export class FieldEncryptionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldEncryptionConfigError";
  }
}

export function isFieldEncryptionConfigError(err: unknown): err is FieldEncryptionConfigError {
  return err instanceof FieldEncryptionConfigError;
}

/** Human-facing reason a key is unusable, or null when it is fine (or absent). */
function describeKeyProblem(hex: string): string | null {
  const trimmed = hex.trim();
  if (!/^[0-9a-fA-F]+$/.test(trimmed)) {
    return `${KEY_ENV} must contain only hex characters (0-9, a-f).`;
  }
  // Buffer.from("abc", "hex") silently drops the trailing nibble rather than
  // failing, so an odd-length value would otherwise look like a length problem.
  if (trimmed.length % 2 !== 0) {
    return `${KEY_ENV} has an odd number of characters — it must be exactly 64.`;
  }
  if (trimmed.length !== 64) {
    return `${KEY_ENV} must be exactly 64 hex characters (32 bytes), but is ${trimmed.length}.`;
  }
  return null;
}

function getKey(): Buffer | null {
  const hex = process.env[KEY_ENV];
  if (!hex) {
    if (!_warnedMissingKey) {
      _warnedMissingKey = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[security] ${KEY_ENV} is not set. Sensitive driver fields (SSN, routing, account) ` +
        `will be stored as plaintext. Set a 64-hex-char key to enable encryption.`
      );
    }
    return null;
  }
  const problem = describeKeyProblem(hex);
  if (problem) throw new FieldEncryptionConfigError(problem);
  return Buffer.from(hex.trim(), "hex");
}

/**
 * Startup/health probe. Reports whether encryption is on, off, or broken without
 * ever returning the key or any material derived from it.
 */
export function getFieldEncryptionStatus(): { state: "enabled" | "disabled" | "misconfigured"; reason?: string } {
  const hex = process.env[KEY_ENV];
  if (!hex) return { state: "disabled" };
  const problem = describeKeyProblem(hex);
  return problem ? { state: "misconfigured", reason: problem } : { state: "enabled" };
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns a portable "enc:<iv>:<authTag>:<ciphertext>" string.
 * If FIELD_ENCRYPTION_KEY is not set, returns the plaintext unchanged (with a startup warning).
 */
export function encryptField(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `enc:${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * Decrypt an "enc:..." string produced by encryptField.
 * Passes through plaintext values transparently (backwards compatibility).
 */
export function decryptField(stored: string): string {
  if (!stored.startsWith("enc:")) return stored;

  const key = getKey();
  if (!key) {
    throw new FieldEncryptionConfigError(
      `Cannot decrypt field: ${KEY_ENV} is not set but an encrypted value was found in the database.`
    );
  }

  const parts = stored.split(":");
  if (parts.length !== 4) throw new Error("Invalid encrypted field format.");

  const [, ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex!, "hex");
  const authTag = Buffer.from(authTagHex!, "hex");
  const ciphertext = Buffer.from(ciphertextHex!, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

/**
 * Safely decrypt a nullable field. Returns null if field is null/undefined.
 * Returns plaintext if FIELD_ENCRYPTION_KEY is not set (backward compat).
 */
export function safeDecryptField(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith("enc:")) return stored;
  return decryptField(stored);
}

/**
 * Extract the last N digits from an encrypted or plaintext field.
 * Returns null if the field is missing.
 */
export function lastN(stored: string | null | undefined, n = 4): string | null {
  if (!stored) return null;
  const plain = safeDecryptField(stored);
  if (!plain) return null;
  return plain.replace(/\D/g, "").slice(-n) || null;
}
