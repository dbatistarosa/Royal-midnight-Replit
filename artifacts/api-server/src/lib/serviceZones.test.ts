import { describe, it, expect } from "vitest";
import { isPickupServiceable, isTripVisibleToDriver, type ZoneCoverage, type ServiceZone } from "./serviceZones";
import { pointInZone } from "./pricing";

/**
 * The service-area rule, as chosen by the operator:
 *
 *   A trip is offered only to drivers whose assigned zones contain its pickup
 *   point. Unknown, unstaffed, and out-of-area pickups fail closed.
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

  it("hides a trip that falls in no service zone", () => {
    expect(isTripVisibleToDriver(PENSACOLA, coverage())).toBe(false);
  });

  it("hides a trip whose zone exists but has no eligible drivers assigned", () => {
    const c = coverage({ staffedZoneIds: new Set([1]) });
    expect(isTripVisibleToDriver(MCO, c)).toBe(false);
  });

  it("hides a trip with no verified coordinates", () => {
    expect(isTripVisibleToDriver(null, coverage())).toBe(false);
  });

  it("fails closed when service areas are unavailable", () => {
    const off = coverage({ enabled: false, zones: [], staffedZoneIds: new Set(), driverZoneIds: new Set() });
    expect(isTripVisibleToDriver(MCO, off)).toBe(false);
    expect(isTripVisibleToDriver(PENSACOLA, off)).toBe(false);
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

describe("isPickupServiceable", () => {
  it("accepts only a verified pickup in a staffed service area", () => {
    expect(isPickupServiceable(FLL, coverage())).toBe(true);
    expect(isPickupServiceable(MCO, coverage({ staffedZoneIds: new Set([1]) }))).toBe(false);
    expect(isPickupServiceable(PENSACOLA, coverage())).toBe(false);
    expect(isPickupServiceable(null, coverage())).toBe(false);
  });

  it("fails closed when service-area configuration is unavailable", () => {
    expect(isPickupServiceable(FLL, coverage({ enabled: false }))).toBe(false);
  });
});
