import { describe, it, expect } from "vitest";
import { validatePassword, MIN_PASSWORD_LENGTH } from "./passwordPolicy.js";

describe("validatePassword", () => {
  it("accepts a reasonable passphrase", () => {
    expect(validatePassword("correct horse battery staple")).toBeNull();
    expect(validatePassword("Tr0ub4dor&3xyz")).toBeNull();
  });

  it("rejects anything shorter than the minimum", () => {
    expect(validatePassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toContain("at least");
    // The old floors this replaces: 6 for passengers/drivers/reset, 8 for admin.
    expect(validatePassword("abc123")).not.toBeNull();
    expect(validatePassword("abcd1234")).not.toBeNull();
  });

  it("rejects a missing or non-string password", () => {
    expect(validatePassword(undefined)).not.toBeNull();
    expect(validatePassword(null)).not.toBeNull();
    expect(validatePassword(12345678901234)).not.toBeNull();
  });

  it("rejects long-but-empty passwords", () => {
    expect(validatePassword("aaaaaaaaaaaaaaaa")).not.toBeNull();
    expect(validatePassword("ababababababab")).not.toBeNull();
  });

  it("rejects the obvious wordlist entries regardless of case", () => {
    expect(validatePassword("password1234")).not.toBeNull();
    expect(validatePassword("RoyalMidnight")).not.toBeNull();
    expect(validatePassword("  royalmidnight1  ")).not.toBeNull();
  });
});
