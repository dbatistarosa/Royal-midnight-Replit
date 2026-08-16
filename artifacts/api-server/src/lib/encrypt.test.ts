import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import {
  encryptField,
  decryptField,
  safeDecryptField,
  lastN,
  getFieldEncryptionStatus,
  isFieldEncryptionConfigError,
} from "./encrypt";

const KEY_ENV = "FIELD_ENCRYPTION_KEY";
const VALID_KEY = crypto.randomBytes(32).toString("hex"); // 64 hex chars

let original: string | undefined;

beforeEach(() => {
  original = process.env[KEY_ENV];
});

afterEach(() => {
  if (original === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = original;
});

describe("encryptField / decryptField with a valid key", () => {
  beforeEach(() => {
    process.env[KEY_ENV] = VALID_KEY;
  });

  it("round-trips a value", () => {
    const cipher = encryptField("021000021");
    expect(cipher).not.toBe("021000021");
    expect(cipher.startsWith("enc:")).toBe(true);
    expect(decryptField(cipher)).toBe("021000021");
  });

  it("produces a different ciphertext each time (fresh IV)", () => {
    expect(encryptField("021000021")).not.toBe(encryptField("021000021"));
  });

  it("masks the last four digits of an encrypted value", () => {
    expect(lastN(encryptField("411061967035"), 4)).toBe("7035");
  });

  it("reports itself as enabled", () => {
    expect(getFieldEncryptionStatus()).toEqual({ state: "enabled" });
  });
});

describe("no key configured", () => {
  beforeEach(() => {
    delete process.env[KEY_ENV];
  });

  it("stores plaintext rather than failing, for backwards compatibility", () => {
    expect(encryptField("021000021")).toBe("021000021");
  });

  it("passes plaintext through the decrypt helpers", () => {
    expect(safeDecryptField("021000021")).toBe("021000021");
    expect(lastN("411061967035", 4)).toBe("7035");
  });

  it("reports itself as disabled", () => {
    expect(getFieldEncryptionStatus()).toEqual({ state: "disabled" });
  });

  it("refuses to silently mangle a value that was encrypted under a key", () => {
    expect(() => safeDecryptField("enc:aa:bb:cc")).toThrow();
  });
});

/**
 * The production failure this guards against: FIELD_ENCRYPTION_KEY was present
 * but not 64 hex characters, so every attempt to save driver bank details threw
 * out of encryptField and reached the browser as a flat 500. A malformed key
 * must be distinguishable from any other error so the route can say which
 * environment variable is wrong.
 */
describe("malformed key", () => {
  const bad: Array<[string, string]> = [
    ["too short", crypto.randomBytes(16).toString("hex")],
    ["too long", crypto.randomBytes(48).toString("hex")],
    ["not hex", "this-is-a-passphrase-not-a-hex-key-of-any-length!"],
    ["odd length", "abc"],
    ["empty-ish whitespace padding around a short value", "  abcd  "],
  ];

  for (const [label, value] of bad) {
    it(`rejects a key that is ${label}, as a config error`, () => {
      process.env[KEY_ENV] = value;

      expect(getFieldEncryptionStatus().state).toBe("misconfigured");

      let thrown: unknown;
      try {
        encryptField("021000021");
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeDefined();
      expect(isFieldEncryptionConfigError(thrown)).toBe(true);
    });
  }

  it("never leaks the key material in the reported reason", () => {
    const secretish = crypto.randomBytes(16).toString("hex");
    process.env[KEY_ENV] = secretish;
    const status = getFieldEncryptionStatus();
    expect(status.reason).toBeDefined();
    expect(status.reason).not.toContain(secretish);
  });

  it("tolerates surrounding whitespace on an otherwise valid key", () => {
    process.env[KEY_ENV] = `  ${VALID_KEY}\n`;
    expect(getFieldEncryptionStatus()).toEqual({ state: "enabled" });
    expect(decryptField(encryptField("021000021"))).toBe("021000021");
  });
});
