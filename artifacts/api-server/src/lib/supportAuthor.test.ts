import { describe, expect, it } from "vitest";
import { supportAuthorRole } from "./supportAuthor.js";

describe("supportAuthorRole", () => {
  it("preserves driver replies as driver messages", () => {
    expect(supportAuthorRole("driver")).toBe("driver");
  });

  it("maps administrators and passenger-facing accounts correctly", () => {
    expect(supportAuthorRole("admin")).toBe("admin");
    expect(supportAuthorRole("passenger")).toBe("passenger");
    expect(supportAuthorRole("corporate")).toBe("passenger");
  });
});
