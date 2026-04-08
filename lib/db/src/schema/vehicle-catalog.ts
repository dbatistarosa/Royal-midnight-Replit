import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const vehicleCatalogTable = pgTable("vehicle_catalog", {
  id: serial("id").primaryKey(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  minYear: integer("min_year").notNull(),
  vehicleTypes: text("vehicle_types").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VehicleCatalogEntry = typeof vehicleCatalogTable.$inferSelect;
export type InsertVehicleCatalogEntry = typeof vehicleCatalogTable.$inferInsert;
