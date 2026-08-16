import { describe, it, expect } from "vitest";
import { isTripVisibleToDriver, type ZoneCoverage, type ServiceZone } from "./serviceZones";
import { pointInZone } from "./pricing";

/**
 * The service-area rule, as chosen by the operator:
 *
 *   A trip is offered only to drivers whose assigned zones contain its pickup
 *   point — EXCEPT when no driver covers that point, in which case it goes to
 *   everyone rather than disappearing.
 *
 * The exception is the part worth pinning down: a hard filter with no fallback
 * loses bookings silently, and "nobody saw it" looks identical to "nobody
 * wanted it" from the admin panel.
 */

const circle = (id: number, name: string, lat: number, lng: number, radiusKm: number): ServiceZone => ({
  id,
  name,
  type: "circle",
  geometry: JSON.stringify({ center: [lat, lng], radiusKm }),
});

const SOUTH_FLORIDA = circle(1, "South Florida", 26.0, -80.2, 70);   // MIA / FLL / PBI
const ORLANDO = circle(2, "Orlando", 28.43, -81.31, 45);             // MCO / SFB
const TAMPA = circle(3, "Tampa", 27.97, -82.53, 45);                 // TPA / PIE / SRQ

const FLL = { lat: 26.0742, lng: -80.1506 };
const MCO = { lat: 28.4312, lng: -81.3081 };
const TPA = { lat: 27.9755, lng: -82.5332 };
const PENSACOLA = { lat: 30.4734, lng: -87.1866 };                   // in no zone at all

const coverage = (over: Partial<ZoneCoverage> = {}): ZoneCoverage => ({
  zones: [SOUTH_FLORIDA, ORLANDO, TAMPA],
  staffedZoneIds: new Set([1, 2, 3]),
  driverZoneIds: new Set([1]),
  enabled: true,
  ...over,
});

describe("pointInZone", () => {
  it("matches a point inside a circular zone", () => {
    expect(pointInZone(FLL.lat, FLL.lng, SOUTH_FLORIDA)).toBe(true);
  });

  it("rejects a point outside it", () => {
    expect(pointInZone(MCO.lat, MCO.lng, SOUTH_FLORIDA)).toBe(false);
  });

  it("matches inside a polygon zone", () => {
    const box: ServiceZone = {
      id: 9, name: "box", type: "polygon",
      geometry: JSON.stringify({ coordinates: [[-81, 27], [-80, 27], [-80, 28], [-81, 28], [-81, 27]] }),
    };
    expect(pointInZone(27.5, -80.5, box)).toBe(true);
    expect(pointInZone(29.0, -80.5, box)).toBe(false);
  });

  it("answers no — never yes — for geometry it cannot parse", () => {
    const broken = [
      { id: 1, name: "bad json", type: "circle", geometry: "{not json" },
      { id: 2, name: "missing radius", type: "circle", geometry: JSON.stringify({ center: [26, -80] }) },
      { id: 3, name: "degenerate ring", type: "polygon", geometry: JSON.stringify({ coordinates: [[-80, 26]] }) },
      { id: 4, name: "unknown type", type: "hexagon", geometry: JSON.stringify({ center: [26, -80], radiusKm: 50 }) },
    ] as ServiceZone[];
    for (const zone of broken) {
      expect(pointInZone(FLL.lat, FLL.lng, zone)).toBe(false);
    }
  });
});

describe("isTripVisibleToDriver", () => {
  it("shows a trip inside a zone the driver is assigned to", () => {
    expect(isTripVisibleToDriver(FLL, coverage())).toBe(true);
  });

  it("hides a trip in a staffed zone the driver is NOT assigned to", () => {
    expect(isTripVisibleToDriver(MCO, coverage())).toBe(false);
    expect(isTripVisibleToDriver(TPA, coverage())).toBe(false);
  });

  it("shows a trip that falls in no zone at all, rather than losing it", () => {
    expect(isTripVisibleToDriver(PENSACOLA, coverage())).toBe(true);
  });

  it("shows a trip whose zone exists but has no drivers assigned", () => {
    // Orlando is drawn, but nobody works it. The South Florida driver still
    // sees the trip so dispatch is not the only path to covering it.
    const c = coverage({ staffedZoneIds: new Set([1]) });
    expect(isTripVisibleToDriver(MCO, c)).toBe(true);
  });

  it("shows a trip with no coordinates — unknown location is not out-of-area", () => {
    expect(isTripVisibleToDriver(null, coverage())).toBe(true);
  });

  it("shows everything when the feature is off (no zones, or migration not run)", () => {
    const off = coverage({ enabled: false, zones: [], staffedZoneIds: new Set(), driverZoneIds: new Set() });
    expect(isTripVisibleToDriver(MCO, off)).toBe(true);
    expect(isTripVisibleToDriver(PENSACOLA, off)).toBe(true);
  });

  it("shows a trip in an overlapping zone when the driver covers either one", () => {
    // Two zones both containing FLL; the driver is assigned only to the second.
    const overlapping = circle(4, "Broward", 26.1, -80.15, 25);
    const c = coverage({
      zones: [SOUTH_FLORIDA, overlapping],
      staffedZoneIds: new Set([1, 4]),
      driverZoneIds: new Set([4]),
    });
    expect(isTripVisibleToDriver(FLL, c)).toBe(true);
  });

  it("hides a trip from a driver assigned to no zones at all while others are staffed", () => {
    const c = coverage({ driverZoneIds: new Set() });
    expect(isTripVisibleToDriver(FLL, c)).toBe(false);
  });
});
