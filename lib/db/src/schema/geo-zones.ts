import { pgTable, serial, text, real, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * Geofenced pricing zones drawn by admin.
 * Two types:
 *   "circle"  — geometry: {"center": [lat, lng], "radiusKm": number}
 *   "polygon" — geometry: GeoJSON polygon coords [[lng,lat],...] (first=last)
 *
 * When a booking route intersects an active zone the quote engine applies
 * rateMultiplier to the subtotal (e.g. 1.25 = 25% surcharge for Keys, 0.9 = 10% discount).
 */
export const geoZonesTable = pgTable("geo_zones", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull().default("circle"), // "circle" | "polygon"
  geometry: text("geometry").notNull(),           // JSON string
  rateMultiplier: real("rate_multiplier").notNull().default(1.0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GeoZone = typeof geoZonesTable.$inferSelect;
