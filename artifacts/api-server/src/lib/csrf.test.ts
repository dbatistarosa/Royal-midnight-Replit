import { describe, expect, it } from "vitest";
import { isTrustedCookieMutationOrigin } from "./csrf.js";

const allowedOrigins = new Set(["https://www.royalmidnight.com"]);

describe("cookie mutation origin protection", () => {
  it("allows same-site cookie mutations", () => {
    expect(
      isTrustedCookieMutationOrigin({
        method: "POST",
        sessionCookie: "session",
        origin: "https://www.royalmidnight.com",
        allowedOrigins,
      }),
    ).toBe(true);
  });

  it("rejects cross-site and originless cookie mutations", () => {
    for (const input of [
      { origin: "https://evil.example" },
      {},
    ]) {
      expect(
        isTrustedCookieMutationOrigin({
          method: "POST",
          sessionCookie: "session",
          allowedOrigins,
          ...input,
        }),
      ).toBe(false);
    }
  });

  it("does not block bearer-only clients or safe reads", () => {
    expect(
      isTrustedCookieMutationOrigin({
        method: "POST",
        allowedOrigins,
      }),
    ).toBe(true);
    expect(
      isTrustedCookieMutationOrigin({
        method: "GET",
        sessionCookie: "session",
        origin: "https://evil.example",
        allowedOrigins,
      }),
    ).toBe(true);
  });
});
