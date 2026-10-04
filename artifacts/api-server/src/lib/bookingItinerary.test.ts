import { describe, expect, it } from "vitest";
import { buildItineraryRows, formatBookingRoute, itineraryNeedsSync, parseLegacyWaypoints } from "./bookingItinerary.js";

describe("formatBookingRoute", () => {
  it("orders pickup, intermediate stops, and final destination by sequence", () => {
    const route = formatBookingRoute(
      { pickupAddress: "Pickup", dropoffAddress: "Airport" },
      [
        { sequence: 2, kind: "final", address: "Airport" },
        { sequence: 1, kind: "stop", address: "Stop B" },
        { sequence: 0, kind: "stop", address: "Stop A" },
      ],
    );

    expect(route).toEqual([
      { kind: "pickup", label: "Pickup", address: "Pickup" },
      { kind: "stop", label: "Stop 1", address: "Stop A" },
      { kind: "stop", label: "Stop 2", address: "Stop B" },
      { kind: "final", label: "Final destination", address: "Airport" },
    ]);
  });

  it("falls back to pickup and drop-off for legacy bookings without rows", () => {
    expect(
      formatBookingRoute({ pickupAddress: "Pickup", dropoffAddress: "Drop-off" }, []),
    ).toEqual([
      { kind: "pickup", label: "Pickup", address: "Pickup" },
      { kind: "final", label: "Final destination", address: "Drop-off" },
    ]);
  });

  it("does not duplicate the final destination when the itinerary has the same address", () => {
    const route = formatBookingRoute(
      { pickupAddress: "Pickup", dropoffAddress: "  Airport, FL " },
      [
        { sequence: 0, kind: "stop", address: "Stop" },
        { sequence: 1, kind: "final", address: "Airport, FL" },
      ],
    );

    expect(route.map((point) => point.address)).toEqual(["Pickup", "Stop", "Airport, FL"]);
    expect(route.filter((point) => point.kind === "final")).toHaveLength(1);
  });
});

describe("buildItineraryRows", () => {
  it("creates ordered stop rows and one final row for an hourly booking", () => {
    expect(buildItineraryRows(22, [" Stop A ", "", "Stop B"], "Airport")).toEqual([
      { bookingId: 22, sequence: 0, kind: "stop", address: "Stop A" },
      { bookingId: 22, sequence: 1, kind: "stop", address: "Stop B" },
      { bookingId: 22, sequence: 2, kind: "final", address: "Airport" },
    ]);
  });
});

describe("parseLegacyWaypoints", () => {
  it("keeps only non-empty string waypoints from the compatibility JSON", () => {
    expect(parseLegacyWaypoints(JSON.stringify([" Stop A ", 3, "", "Stop B"]))).toEqual(["Stop A", "Stop B"]);
    expect(parseLegacyWaypoints("not-json")).toEqual([]);
  });
});

describe("itinerary synchronization", () => {
  it("detects a legacy final-only row that lost the required hourly stop", () => {
    const expected = buildItineraryRows(22, ["MIA - Miami International Airport"], "FLL - Fort Lauderdale-Hollywood International Airport");
    expect(itineraryNeedsSync([
      { sequence: 0, kind: "final", address: "FLL - Fort Lauderdale-Hollywood International Airport" },
    ], expected)).toBe(true);
  });

  it("keeps a complete ordered itinerary unchanged", () => {
    const expected = buildItineraryRows(22, ["MIA - Miami International Airport"], "FLL - Fort Lauderdale-Hollywood International Airport");
    expect(itineraryNeedsSync(expected, expected)).toBe(false);
  });
});
