import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_ENV = "FIELD_ENCRYPTION_KEY";

let _warnedMissingKey = false;

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
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error(`${KEY_ENV} must be exactly 32 bytes (64 hex characters).`);
  }
  return buf;
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
    throw new Error(
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
