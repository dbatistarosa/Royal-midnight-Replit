import { describe, it, expect } from "vitest";
import {
  isAirportTrip,
  resolveAddress,
  fallbackDistance,
  haversineKm,
  pointInPolygon,
  normalizePercentRate,
  computeFareBreakdown,
  computePostTripCharge,
  AIRPORT_ADDRESSES,
} from "./pricing";

describe("isAirportTrip", () => {
  it("matches a bare airport code", () => {
    expect(isAirportTrip("FLL")).toBe(true);
  });

  it("matches a full airport name case-insensitively", () => {
    expect(isAirportTrip("Near Miami International Airport, Concourse D")).toBe(true);
  });

  it("returns false for a non-airport address", () => {
    expect(isAirportTrip("456 Ocean Drive, Naples, FL")).toBe(false);
  });
});

describe("resolveAddress", () => {
  it("resolves a bare airport code to its canonical address", () => {
    expect(resolveAddress("FLL")).toBe(AIRPORT_ADDRESSES.FLL);
  });

  it("resolves a dropdown shortcut format", () => {
    expect(resolveAddress("FLL - Fort Lauderdale-Hollywood International Airport")).toBe(AIRPORT_ADDRESSES.FLL);
  });

  it("passes through a regular address unchanged (trimmed)", () => {
    expect(resolveAddress("  123 Main St, Miami, FL  ")).toBe("123 Main St, Miami, FL");
  });
});

describe("fallbackDistance", () => {
  it("returns the known FLL<->MIA distance regardless of direction", () => {
    expect(fallbackDistance("FLL", "Miami International")).toEqual({ distance: 35, duration: 45 });
    expect(fallbackDistance("Miami International", "FLL")).toEqual({ distance: 35, duration: 45 });
  });

  it("falls back to a generic South Florida estimate for an unknown pair", () => {
    expect(fallbackDistance("Naples, FL", "Orlando, FL")).toEqual({ distance: 25, duration: 40 });
  });
});

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm(25.7617, -80.1918, 25.7617, -80.1918)).toBe(0);
  });

  it("returns a plausible distance between Miami and Fort Lauderdale", () => {
    const km = haversineKm(25.7617, -80.1918, 26.1224, -80.1373);
    expect(km).toBeGreaterThan(35);
    expect(km).toBeLessThan(45);
  });
});

describe("pointInPolygon", () => {
  // GeoJSON order: [lng, lat]
  const square = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

  it("detects a point inside the polygon", () => {
    expect(pointInPolygon(0, 0, square)).toBe(true);
  });

  it("detects a point outside the polygon", () => {
    expect(pointInPolygon(5, 5, square)).toBe(false);
  });
});

describe("normalizePercentRate", () => {
  it("converts a whole-percent value to a decimal fraction", () => {
    expect(normalizePercentRate(7)).toBe(0.07);
  });

  it("leaves an already-decimal fraction unchanged", () => {
    expect(normalizePercentRate(0.07)).toBe(0.07);
  });
});

describe("computeFareBreakdown", () => {
  it("assembles subtotal, tax, and card fee with no zone surge", () => {
    const result = computeFareBreakdown({
      baseFare: 55,
      distanceCharge: 35,
      airportFee: 10,
      zoneMultiplier: 1,
      taxRate: 0.07,
      cardProcessingFeeRate: 0.03,
    });
    expect(result.subtotalBeforeZone).toBe(100);
    expect(result.subtotal).toBe(100);
    expect(result.surgeAdjustment).toBe(0);
    expect(result.taxAmount).toBe(7);
    expect(result.cardProcessingFee).toBeCloseTo(3.21, 2);
    expect(result.totalWithTax).toBeCloseTo(110.21, 2);
  });

  it("reports the zone surge as its own line item, not folded into the subtotal silently", () => {
    const result = computeFareBreakdown({
      baseFare: 50,
      distanceCharge: 0,
      airportFee: 0,
      zoneMultiplier: 1.2,
      taxRate: 0,
      cardProcessingFeeRate: 0,
    });
    expect(result.subtotalBeforeZone).toBe(50);
    expect(result.subtotal).toBe(60);
    expect(result.surgeAdjustment).toBe(10);
  });

  it("applies a corporate volume discount after zone surge and before tax", () => {
    const result = computeFareBreakdown({
      baseFare: 100,
      distanceCharge: 0,
      airportFee: 0,
      zoneMultiplier: 1,
      corporateDiscountPct: 10,
      taxRate: 0.1,
      cardProcessingFeeRate: 0,
    });
    expect(result.corporateDiscountAmount).toBe(10);
    expect(result.subtotal).toBe(90);
    // Tax is computed on the post-discount subtotal, not the original 100.
    expect(result.taxAmount).toBe(9);
  });

  it("defaults the corporate discount to 0 when omitted (no behavior change for non-corporate quotes)", () => {
    const result = computeFareBreakdown({
      baseFare: 100,
      distanceCharge: 0,
      airportFee: 0,
      zoneMultiplier: 1,
      taxRate: 0,
      cardProcessingFeeRate: 0,
    });
    expect(result.corporateDiscountAmount).toBe(0);
    expect(result.subtotal).toBe(100);
  });

  it("charges tax and the card fee on add-ons, not just on the fare", () => {
    const result = computeFareBreakdown({
      baseFare: 100,
      distanceCharge: 0,
      airportFee: 0,
      zoneMultiplier: 1,
      extrasTotal: 900,
      taxRate: 0.07,
      cardProcessingFeeRate: 0.04,
    });
    // Add-ons used to be added to the total AFTER this function had finished,
    // so a $900 champagne order carried no tax and no processing fee at all.
    expect(result.taxableSubtotal).toBe(1000);
    expect(result.taxAmount).toBe(70);
    expect(result.cardProcessingFee).toBeCloseTo(42.8, 2);
    expect(result.totalWithTax).toBeCloseTo(1112.8, 2);
    // The commission base is unchanged: the chauffeur still earns on the fare.
    expect(result.subtotal).toBe(100);
  });

  it("reproduces booking #13 — the charter that was billed with untaxed add-ons", () => {
    // Business sedan, 3-hour charter at $75/hr: base 20 + distance 205 + $10
    // airport fee, with $860 of add-ons. It was sold for $1,121.51, of which
    // $860 carried neither tax nor card fee.
    const result = computeFareBreakdown({
      baseFare: 20,
      distanceCharge: 205,
      airportFee: 10,
      zoneMultiplier: 1,
      extrasTotal: 860,
      taxRate: 0.07,
      cardProcessingFeeRate: 0.04,
    });
    expect(result.subtotal).toBe(235);
    expect(result.taxableSubtotal).toBe(1095);
    expect(result.taxAmount).toBeCloseTo(76.65, 2);
    expect(result.cardProcessingFee).toBeCloseTo(46.87, 2);
    expect(result.totalWithTax).toBeCloseTo(1218.52, 2);
  });

  it("leaves the total untouched when there are no add-ons", () => {
    const withField = computeFareBreakdown({
      baseFare: 55, distanceCharge: 35, airportFee: 10, zoneMultiplier: 1,
      extrasTotal: 0, taxRate: 0.07, cardProcessingFeeRate: 0.03,
    });
    const without = computeFareBreakdown({
      baseFare: 55, distanceCharge: 35, airportFee: 10, zoneMultiplier: 1,
      taxRate: 0.07, cardProcessingFeeRate: 0.03,
    });
    expect(withField.totalWithTax).toBe(without.totalWithTax);
    expect(without.totalWithTax).toBeCloseTo(110.21, 2);
  });
});

describe("computePostTripCharge", () => {
  it("adds tax and the card fee to a full-hour overage", () => {
    const r = computePostTripCharge({ fare: 75, taxRate: 0.07, cardProcessingFeeRate: 0.04 });
    expect(r.fare).toBe(75);
    expect(r.taxAmount).toBeCloseTo(5.25, 2);
    expect(r.cardProcessingFee).toBeCloseTo(3.21, 2);
    expect(r.total).toBeCloseTo(83.46, 2);
  });

  it("keeps the pre-tax fare separate, because that is the commission base", () => {
    // Paying the chauffeur 70% of `total` would hand them a share of Florida's
    // sales tax and of the card processor's fee.
    const r = computePostTripCharge({ fare: 150, taxRate: 0.07, cardProcessingFeeRate: 0.04 });
    expect(r.fare).toBe(150);
    expect(r.total).toBeGreaterThan(r.fare);
  });

  it("charges nothing when there is no overage", () => {
    const r = computePostTripCharge({ fare: 0, taxRate: 0.07, cardProcessingFeeRate: 0.04 });
    expect(r).toEqual({ fare: 0, taxAmount: 0, cardProcessingFee: 0, total: 0 });
  });

  it("never produces a negative charge from a negative input", () => {
    const r = computePostTripCharge({ fare: -50, taxRate: 0.07, cardProcessingFeeRate: 0.04 });
    expect(r.total).toBe(0);
  });
});
