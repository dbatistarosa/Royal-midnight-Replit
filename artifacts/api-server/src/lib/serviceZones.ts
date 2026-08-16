import { eq, and } from "drizzle-orm";
import { db, geoZonesTable, driverServiceZonesTable } from "@workspace/db";
import { pointInZone } from "./pricing.js";
import { tableExists } from "./schemaGuards.js";

/**
 * Which trips a chauffeur is allowed to see.
 *
 * The open pool had no geographic filter at all: an approved driver in Miami
 * saw pickups in Pensacola. drivers.service_area existed but was a free-text
 * label read by nothing.
 *
 * The rule, as chosen by the operator:
 *
 *   A trip is offered only to drivers whose assigned service zones contain its
 *   pickup point — EXCEPT when no driver covers that point at all, in which
 *   case it is offered to everyone rather than disappearing.
 *
 * That exception is the whole reason this is not a one-line SQL join. A hard
 * filter with no fallback loses bookings silently: a pickup just outside every
 * drawn zone, a brand-new metro nobody is assigned to yet, or an address Mapbox
 * could not geocode would each vanish from every driver's list while looking
 * perfectly healthy in the admin panel. Trips that nobody's zone covers stay
 * visible to all, and dispatch can assign them by hand.
 */

export type ServiceZone = {
  id: number;
  name: string;
  type: string;
  geometry: string;
};

export type PickupPoint = { lat: number; lng: number } | null;

/**
 * Everything the pool filter needs, fetched once per request rather than per
 * booking. Zones are few (a handful of metros) and change rarely.
 */
export type ZoneCoverage = {
  /** Active service-area zones, whether or not anyone is assigned to them. */
  zones: ServiceZone[];
  /** Zone ids with at least one driver assigned — the "covered" set. */
  staffedZoneIds: Set<number>;
  /** The zone ids assigned to the driver asking. */
  driverZoneIds: Set<number>;
  /** False when the schema predates migration 0009; the filter then no-ops. */
  enabled: boolean;
};

/** Migration 0009 may not have run yet on a given database. Referencing the
 *  table before it exists would take the whole trip pool down, which is a far
 *  worse failure than not filtering. */
async function hasServiceZoneTable(): Promise<boolean> {
  return tableExists("public.driver_service_zones");
}

export async function loadZoneCoverage(driverId: number): Promise<ZoneCoverage> {
  const empty: ZoneCoverage = { zones: [], staffedZoneIds: new Set(), driverZoneIds: new Set(), enabled: false };
  if (!(await hasServiceZoneTable())) return empty;

  try {
    const [zones, assignments] = await Promise.all([
      db
        .select({
          id: geoZonesTable.id,
          name: geoZonesTable.name,
          type: geoZonesTable.type,
          geometry: geoZonesTable.geometry,
        })
        .from(geoZonesTable)
        .where(and(eq(geoZonesTable.isActive, true), eq(geoZonesTable.isServiceArea, true))),
      db
        .select({ driverId: driverServiceZonesTable.driverId, zoneId: driverServiceZonesTable.zoneId })
        .from(driverServiceZonesTable),
    ]);

    // No service areas defined, or none staffed — the feature is effectively
    // off and every driver sees everything, exactly as before.
    if (zones.length === 0) return empty;

    const staffedZoneIds = new Set(assignments.map(a => a.zoneId));
    const driverZoneIds = new Set(assignments.filter(a => a.driverId === driverId).map(a => a.zoneId));

    return { zones, staffedZoneIds, driverZoneIds, enabled: true };
  } catch {
    // A failure here must not empty the pool. Fail open.
    return empty;
  }
}

/**
 * Should this driver be offered this trip?
 *
 * `coverage` comes from loadZoneCoverage() once per request; this is then a
 * pure in-memory test per booking, with no further queries or geocoding.
 */
export function isTripVisibleToDriver(pickup: PickupPoint, coverage: ZoneCoverage): boolean {
  if (!coverage.enabled) return true;

  // No coordinates on the booking (created before migration 0009, or the
  // address could not be geocoded). Unknown location is not the same as "out of
  // area", so it goes to everyone.
  if (!pickup) return true;

  const containing = coverage.zones.filter(z => pointInZone(pickup.lat, pickup.lng, z));
  if (containing.length === 0) return true; // outside every drawn zone

  // Only zones that actually have drivers can claim a trip. If a pickup falls
  // inside "Jacksonville" and nobody works Jacksonville, the trip is orphaned
  // and must stay visible rather than being hidden from the drivers who could
  // still take it.
  const staffedContaining = containing.filter(z => coverage.staffedZoneIds.has(z.id));
  if (staffedContaining.length === 0) return true;

  return staffedContaining.some(z => coverage.driverZoneIds.has(z.id));
}

/** Parse the numeric-typed lat/lng drizzle returns as strings. */
export function toPickupPoint(lat: string | null, lng: string | null): PickupPoint {
  if (lat == null || lng == null) return null;
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
  return { lat: latNum, lng: lngNum };
}
