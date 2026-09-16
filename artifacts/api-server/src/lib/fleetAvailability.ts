import {
  db,
  bookingsTable,
  driversTable,
  driverVehiclesTable,
  driverServiceZonesTable,
  geoZonesTable,
} from "@workspace/db";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { pointInZone } from "./pricing.js";
import { tripConflicts, vehicleFits, type TripWindowInput } from "./scheduling.js";
import type { PickupPoint } from "./serviceZones.js";

type Executor = Pick<typeof db, "select" | "execute">;
type AvailabilityRequest = TripWindowInput & {
  pickupPoint: PickupPoint;
  vehicleClass: string;
  passengers: number;
  luggageCount: number;
};

const activeAssigned = ["assigned", "confirmed", "on_way", "on_location", "in_progress"];

/**
 * Number of safe remaining slots for a request. Drivers are deduplicated even
 * when they registered multiple matching vehicles. Existing unassigned trips
 * in the same area and time window consume capacity too, preventing the site
 * from selling three simultaneous rides when only two chauffeurs can serve.
 */
export async function fleetAvailability(
  request: AvailabilityRequest,
  executor: Executor = db,
): Promise<{ available: boolean; eligibleDrivers: number; reservedSlots: number }> {
  if (!request.pickupPoint) return { available: false, eligibleDrivers: 0, reservedSlots: 0 };

  const zones = await executor
    .select({ id: geoZonesTable.id, type: geoZonesTable.type, geometry: geoZonesTable.geometry })
    .from(geoZonesTable)
    .where(and(eq(geoZonesTable.isActive, true), eq(geoZonesTable.isServiceArea, true)));
  const containingZoneIds = zones
    .filter(zone => pointInZone(request.pickupPoint!.lat, request.pickupPoint!.lng, zone))
    .map(zone => zone.id);
  if (!containingZoneIds.length) return { available: false, eligibleDrivers: 0, reservedSlots: 0 };

  const assignedDrivers = await executor
    .select({ id: driversTable.id })
    .from(driverServiceZonesTable)
    .innerJoin(driversTable, eq(driverServiceZonesTable.driverId, driversTable.id))
    .where(and(
      inArray(driverServiceZonesTable.zoneId, containingZoneIds),
      eq(driversTable.approvalStatus, "approved"),
      eq(driversTable.complianceHold, false),
      ne(driversTable.status, "paused"),
    ));
  const zoneDriverIds = [...new Set(assignedDrivers.map(row => row.id))];
  if (!zoneDriverIds.length) return { available: false, eligibleDrivers: 0, reservedSlots: 0 };

  const vehicles = await executor
    .select({
      driverId: driverVehiclesTable.driverId,
      vehicleClass: driverVehiclesTable.vehicleClass,
      passengerCapacity: driverVehiclesTable.passengerCapacity,
      luggageCapacity: driverVehiclesTable.luggageCapacity,
    })
    .from(driverVehiclesTable)
    .where(inArray(driverVehiclesTable.driverId, zoneDriverIds));
  const capableIds = [...new Set(vehicles
    .filter(vehicle => vehicleFits(vehicle, request))
    .map(vehicle => vehicle.driverId))];
  if (!capableIds.length) return { available: false, eligibleDrivers: 0, reservedSlots: 0 };

  const assignedWindows = await executor
    .select({
      driverId: bookingsTable.driverId,
      pickupAt: bookingsTable.pickupAt,
      estimatedDurationMinutes: bookingsTable.estimatedDurationMinutes,
      charterMode: bookingsTable.charterMode,
      charterHours: bookingsTable.charterHours,
    })
    .from(bookingsTable)
    .where(and(
      inArray(bookingsTable.driverId, capableIds),
      inArray(bookingsTable.status, activeAssigned),
    ));
  const freeIds = capableIds.filter(driverId => !tripConflicts(
    request,
    assignedWindows.filter(row => row.driverId === driverId),
  ));

  const result = await executor.execute(sql`
    SELECT id,pickup_at,estimated_duration_minutes,charter_mode,charter_hours,pickup_lat,pickup_lng
      FROM bookings
     WHERE driver_id IS NULL AND pickup_at>now()
       AND status IN ('pending','authorized','confirmed')
  `);
  const rows = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? []) as Array<Record<string, unknown>>;
  const reservations = rows.filter(row => {
    const lat = Number(row["pickup_lat"]);
    const lng = Number(row["pickup_lng"]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    const sameMarket = zones.some(zone => containingZoneIds.includes(zone.id) && pointInZone(lat, lng, zone));
    return sameMarket && tripConflicts(request, [{
      pickupAt: row["pickup_at"] as Date | string,
      estimatedDurationMinutes: Number(row["estimated_duration_minutes"]) || null,
      charterMode: row["charter_mode"] as string | null,
      charterHours: Number(row["charter_hours"]) || null,
    }]);
  }).length;

  return {
    available: freeIds.length > reservations,
    eligibleDrivers: freeIds.length,
    reservedSlots: reservations,
  };
}
