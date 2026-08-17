import { describe, it, expect, vi } from "vitest";

// commission.ts reaches for the DB through bookingExtras.ts at import time.
// These tests exercise the pure arithmetic only.
vi.mock("@workspace/db", () => ({ db: {}, settingsTable: {} }));

const { parseCommissionPct, computeDriverEarnings } = await import("./commission");

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

describe("computeDriverEarnings", () => {
  it("is commission on the fare when there is nothing else", () => {
    expect(computeDriverEarnings({ fareSubtotal: 225, commissionPct: 0.7 })).toBe(157.5);
  });

  it("adds paid-to-driver add-ons in FULL, with no commission taken", () => {
    // Pet $20 + car seat $40 are the chauffeur's own work and equipment.
    // Every trip-offer email and push used to omit these entirely, so the
    // notification said $157.50 and the app said $217.50 for the same trip.
    expect(computeDriverEarnings({ fareSubtotal: 225, commissionPct: 0.7, driverExtras: 60 })).toBe(217.5);
  });

  it("pays commission on overtime, because it is time worked", () => {
    expect(computeDriverEarnings({ fareSubtotal: 225, commissionPct: 0.7, overtimeFare: 75 })).toBe(210);
  });

  it("takes the overtime commission on the PRE-TAX charge", () => {
    // The customer pays $83.46 for an extra hour ($75 + tax + card fee). Paying
    // 70% of that would hand the chauffeur a share of Florida's sales tax.
    const onFare = computeDriverEarnings({ fareSubtotal: 0, commissionPct: 0.7, overtimeFare: 75 });
    const onTotal = computeDriverEarnings({ fareSubtotal: 0, commissionPct: 0.7, overtimeFare: 83.46 });
    expect(onFare).toBe(52.5);
    expect(onTotal).toBeGreaterThan(onFare);
  });

  it("combines all three components", () => {
    expect(computeDriverEarnings({
      fareSubtotal: 225, commissionPct: 0.7, overtimeFare: 75, driverExtras: 60,
    })).toBe(270);
  });
});
