import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { hashPassword, verifyPassword, isValidHash, isLegacyHash } from "./hash";

describe("hashPassword / verifyPassword", () => {
  it("round-trips a password through bcrypt", () => {
    const hash = hashPassword("correct-horse-battery-staple");
    expect(verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
  });

  it("rejects the wrong password", () => {
    const hash = hashPassword("correct-horse-battery-staple");
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("still verifies legacy SHA256 hashes so existing users can log in", () => {
    // Mirrors hash.ts's own OLD_SALT constant so this test breaks loudly if
    // that legacy fallback is ever changed/removed.
    const legacyHash = crypto.createHash("sha256").update("legacy-password" + "royal_midnight_salt").digest("hex");
    expect(verifyPassword("legacy-password", legacyHash)).toBe(true);
    expect(verifyPassword("wrong-password", legacyHash)).toBe(false);
  });
});

describe("isLegacyHash", () => {
  it("flags a SHA-256 hex digest so the login handler can upgrade it", () => {
    const legacyHash = crypto.createHash("sha256").update("x" + "royal_midnight_salt").digest("hex");
    expect(isLegacyHash(legacyHash)).toBe(true);
  });

  it("does not flag a bcrypt hash", () => {
    expect(isLegacyHash(hashPassword("anything"))).toBe(false);
  });

  it("does not flag a 64-char value that is not lowercase hex", () => {
    expect(isLegacyHash("Z".repeat(64))).toBe(false);
  });
});

describe("isValidHash", () => {
  it("accepts a real bcrypt hash", () => {
    expect(isValidHash(hashPassword("anything"))).toBe(true);
  });

  it("rejects an obviously short value", () => {
    expect(isValidHash("short")).toBe(false);
  });
});
