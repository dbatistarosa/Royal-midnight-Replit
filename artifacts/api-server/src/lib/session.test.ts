import { describe, it, expect } from "vitest";
import { hashSessionToken, generateSessionToken } from "./session.js";

describe("session tokens", () => {
  it("generates 64 hex characters — the same shape as the plaintext tokens it replaces, so no column change is needed", () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not generate the same token twice", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateSessionToken()));
    expect(seen.size).toBe(200);
  });

  it("hashes deterministically, so a token still resolves its own session", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("never stores the token itself — a database read must not yield a usable session", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).not.toBe(token);
  });

  it("gives different hashes for different tokens", () => {
    expect(hashSessionToken("a")).not.toBe(hashSessionToken("b"));
  });
});
