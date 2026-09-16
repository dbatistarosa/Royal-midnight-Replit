import { expect, it } from "vitest";
import { fleetAvailability } from "./fleetAvailability.js";

function executor(openBookings: Array<Record<string, unknown>> = [], assignedWindows: unknown[] = []) {
  const responses: unknown[][] = [
    [{ id: 1, type: "circle", geometry: JSON.stringify({ center: [25.76, -80.19], radiusKm: 30 }) }],
    [{ id: 10 }, { id: 11 }],
    [
      { driverId: 10, vehicleClass: "business", passengerCapacity: 3, luggageCapacity: 3 },
      { driverId: 11, vehicleClass: "business", passengerCapacity: 3, luggageCapacity: 5 },
    ],
    assignedWindows,
  ];
  return {
    select: () => ({
      from: () => ({
        where: async () => responses.shift() ?? [],
        innerJoin: () => ({ where: async () => responses.shift() ?? [] }),
      }),
    }),
    execute: async () => ({ rows: openBookings }),
  } as never;
}

const request = {
  pickupPoint: { lat: 25.76, lng: -80.19 },
  pickupAt: "2026-10-10T15:00:00Z",
  estimatedDurationMinutes: 60,
  charterMode: null,
  charterHours: null,
  vehicleClass: "business",
  passengers: 3,
  luggageCount: 4,
};

it("requires passenger and luggage capacity on the same registered vehicle", async () => {
  await expect(fleetAvailability(request, executor())).resolves.toEqual({
    available: true,
    eligibleDrivers: 1,
    reservedSlots: 0,
  });
});

it("withholds the category when simultaneous open trips consume every capable driver", async () => {
  const open = [{
    id: 50,
    pickup_at: "2026-10-10T15:15:00Z",
    estimated_duration_minutes: 30,
    charter_mode: null,
    charter_hours: null,
    pickup_lat: "25.76",
    pickup_lng: "-80.19",
  }];
  await expect(fleetAvailability(request, executor(open))).resolves.toMatchObject({
    available: false,
    eligibleDrivers: 1,
    reservedSlots: 1,
  });
});

it("excludes a capable chauffeur whose assigned trip conflicts with the request", async () => {
  const assigned = [{
    driverId: 11,
    pickupAt: "2026-10-10T15:30:00Z",
    estimatedDurationMinutes: 45,
    charterMode: null,
    charterHours: null,
  }];
  await expect(fleetAvailability(request, executor([], assigned))).resolves.toMatchObject({
    available: false,
    eligibleDrivers: 0,
  });
});
