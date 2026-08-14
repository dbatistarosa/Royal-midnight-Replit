import { describe, it, expect, beforeAll } from "vitest";
import { signObjectPath, verifyObjectSignature, signedObjectDownloadPath } from "./signedUrl.js";

beforeAll(() => {
  process.env["SESSION_SECRET"] = "test-session-secret-that-is-long-enough";
});

describe("verifyObjectSignature", () => {
  it("accepts a signature it just minted", () => {
    const { exp, sig } = signObjectPath("/objects/uploads/abc");
    expect(verifyObjectSignature("/objects/uploads/abc", exp, sig)).toBe(true);
  });

  it("refuses a signature minted for a different object", () => {
    const { exp, sig } = signObjectPath("/objects/uploads/abc");
    expect(verifyObjectSignature("/objects/uploads/other", exp, sig)).toBe(false);
  });

  it("refuses an expired signature", () => {
    const { sig } = signObjectPath("/objects/uploads/abc", -60);
    const past = Math.floor(Date.now() / 1000) - 60;
    expect(verifyObjectSignature("/objects/uploads/abc", past, sig)).toBe(false);
  });

  it("refuses a tampered expiry", () => {
    const { exp, sig } = signObjectPath("/objects/uploads/abc");
    expect(verifyObjectSignature("/objects/uploads/abc", exp + 3600, sig)).toBe(false);
  });

  it("refuses garbage", () => {
    expect(verifyObjectSignature("/objects/uploads/abc", "abc", "def")).toBe(false);
    expect(verifyObjectSignature("/objects/uploads/abc", undefined, undefined)).toBe(false);
  });
});

describe("signedObjectDownloadPath", () => {
  it("produces a path the download route will verify", () => {
    const path = signedObjectDownloadPath("/objects/uploads/abc");
    expect(path).not.toBeNull();
    const url = new URL(`http://x${path}`);
    expect(url.pathname).toBe("/storage/objects/uploads/abc");
    expect(
      verifyObjectSignature("/objects/uploads/abc", url.searchParams.get("exp"), url.searchParams.get("sig")),
    ).toBe(true);
  });

  it("accepts a bare key as well as an /objects/ path", () => {
    expect(signedObjectDownloadPath("uploads/abc")).toContain("/storage/objects/uploads/abc?");
  });

  it("refuses an absolute URL — a driver-supplied value must never be echoed to another host", () => {
    expect(signedObjectDownloadPath("https://evil.example/beacon.png")).toBeNull();
    expect(signedObjectDownloadPath("HTTP://evil.example/beacon.png")).toBeNull();
  });

  it("refuses traversal and empty input", () => {
    expect(signedObjectDownloadPath("/objects/../../etc/passwd")).toBeNull();
    expect(signedObjectDownloadPath("")).toBeNull();
    expect(signedObjectDownloadPath(null)).toBeNull();
    expect(signedObjectDownloadPath(undefined)).toBeNull();
  });
});
