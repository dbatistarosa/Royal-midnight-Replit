import { describe, expect, it } from "vitest";
import { getRouteMapImageResult, orderedRouteAddresses } from "./maps.js";

describe("driver route map inputs", () => {
  it("keeps pickup, ordered stops and final destination bounded", () => {
    const addresses = orderedRouteAddresses(" Pickup ", ["Stop 1", "", "Stop 2"], " Dropoff ");
    expect(addresses).toEqual(["Pickup", "Stop 1", "Stop 2", "Dropoff"]);
  });

  it("caps provider waypoints to the supported route limit", () => {
    const addresses = orderedRouteAddresses("Pickup", Array.from({ length: 30 }, (_, i) => `Stop ${i}`), "Dropoff");
    expect(addresses).toHaveLength(25);
    expect(addresses[0]).toBe("Pickup");
    expect(addresses.at(-1)).toBe("Stop 23");
  });
});

describe("driver route map diagnostics", () => {
  it("distinguishes an unconfigured Mapbox token from a provider failure", async () => {
    const previous = process.env.MAPBOX_ACCESS_TOKEN;
    delete process.env.MAPBOX_ACCESS_TOKEN;
    try {
      await expect(getRouteMapImageResult("Pickup", [], "Dropoff")).resolves.toEqual({
        image: null,
        reason: "mapbox_not_configured",
      });
    } finally {
      if (previous == null) delete process.env.MAPBOX_ACCESS_TOKEN;
      else process.env.MAPBOX_ACCESS_TOKEN = previous;
    }
  });
});
