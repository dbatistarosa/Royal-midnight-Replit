import { pgTable, uuid, integer, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const driverLocationsTable = pgTable("driver_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: integer("driver_id").notNull(),
  bookingId: integer("booking_id"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDriverLocationSchema = createInsertSchema(driverLocationsTable).omit({ id: true, recordedAt: true });
export type InsertDriverLocation = z.infer<typeof insertDriverLocationSchema>;
export type DriverLocation = typeof driverLocationsTable.$inferSelect;
