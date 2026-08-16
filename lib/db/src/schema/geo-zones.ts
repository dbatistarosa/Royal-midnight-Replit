import { pgTable, serial, integer, text, real, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { driversTable } from "./drivers";

/**
 * Geofenced zones drawn by admin. A zone does two independent jobs, and a zone
 * may do either, both, or neither:
 *
 *  1. PRICING — when a booking route intersects an active zone, the quote
 *     engine applies rateMultiplier to the subtotal (1.25 = 25% Keys
 *     surcharge, 0.9 = 10% discount). This is what zones did originally.
 *
 *  2. SERVICE AREA — when isServiceArea is set, the zone can be assigned to
 *     chauffeurs, and the open trip pool only offers a trip to drivers whose
 *     assigned zones contain its pickup point. "South Florida (MIA/FLL/PBI)",
 *     "Tampa (TPA/PIE/SRQ)" and "Orlando (MCO/SFB)" are service areas; the
 *     Keys surcharge zone is not.
 *
 * Kept as one table rather than two because both jobs need exactly the same
 * geometry and the same point-in-zone test, and an operator drawing "Orlando"
 * should not have to draw it twice to both price it and staff it.
 *
 * Two geometry types:
 *   "circle"  — geometry: {"center": [lat, lng], "radiusKm": number}
 *   "polygon" — geometry: GeoJSON polygon coords [[lng,lat],...] (first=last)
 */
export const geoZonesTable = pgTable("geo_zones", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull().default("circle"), // "circle" | "polygon"
  geometry: text("geometry").notNull(),           // JSON string
  rateMultiplier: real("rate_multiplier").notNull().default(1.0),
  /** Can chauffeurs be assigned to this zone, and does it gate the trip pool? */
  isServiceArea: boolean("is_service_area").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GeoZone = typeof geoZonesTable.$inferSelect;

/**
 * driver_service_zones — which chauffeurs work which areas.
 *
 * drivers.service_area already existed but was a single free-text label chosen
 * once at onboarding and read by nothing: it filtered no query and gated no
 * pool, so every approved driver in the state saw every trip in the state.
 * A driver normally covers more than one metro anyway, which a single text
 * column cannot express.
 */
export const driverServiceZonesTable = pgTable("driver_service_zones", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
  zoneId: integer("zone_id").notNull().references(() => geoZonesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("driver_service_zones_driver_zone_unique").on(t.driverId, t.zoneId),
  index("driver_service_zones_zone_idx").on(t.zoneId),
]);

export type DriverServiceZone = typeof driverServiceZonesTable.$inferSelect;
