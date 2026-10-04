import { describe, expect, it } from "vitest";
import { isStrictDateOnly, SUPPORTED_DOCUMENT_CONTENT_TYPES } from "./documentValidation";

describe("compliance document date validation", () => {
  it("accepts real ISO calendar dates", () => {
    expect(isStrictDateOnly("2026-02-28")).toBe(true);
    expect(isStrictDateOnly("2024-02-29")).toBe(true);
  });

  it("rejects normalized, malformed and non-date values", () => {
    expect(isStrictDateOnly("2026-02-29")).toBe(false);
    expect(isStrictDateOnly("2025-02-29")).toBe(false);
    expect(isStrictDateOnly("2026-04-31")).toBe(false);
    expect(isStrictDateOnly("02/28/2026")).toBe(false);
    expect(isStrictDateOnly("2026-2-8")).toBe(false);
  });

  it("keeps the upload/view contract limited to document media", () => {
    expect(SUPPORTED_DOCUMENT_CONTENT_TYPES.has("application/pdf")).toBe(true);
    expect(SUPPORTED_DOCUMENT_CONTENT_TYPES.has("image/jpeg")).toBe(true);
    expect(SUPPORTED_DOCUMENT_CONTENT_TYPES.has("text/html")).toBe(false);
  });
});
