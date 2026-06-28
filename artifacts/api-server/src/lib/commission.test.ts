import { describe, it, expect } from "vitest";
import { parseCommissionPct } from "./commission";

describe("parseCommissionPct", () => {
  it("defaults to 70% when no value is stored", () => {
    expect(parseCommissionPct(undefined)).toBe(0.7);
  });

  it("treats a whole-number percent as a percentage", () => {
    expect(parseCommissionPct("70")).toBe(0.7);
  });

  it("treats a decimal fraction as already-normalized", () => {
    expect(parseCommissionPct("0.7")).toBe(0.7);
  });

  it("falls back to 70% for an unparseable value", () => {
    expect(parseCommissionPct("not-a-number")).toBe(0.7);
  });

  it("treats exactly 1 as 100%, not as 1%", () => {
    // n > 1 is false when n === 1, so a stored value of "1" means the driver
    // keeps 100% — documenting this boundary so a future "improvement" to
    // >= doesn't silently change what every driver gets paid.
    expect(parseCommissionPct("1")).toBe(1);
  });
});
