import { pgTable, serial, integer, text, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const driversTable = pgTable("drivers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  licenseNumber: text("license_number").unique(),
  status: text("status").notNull().default("pending"),
  isOnline: boolean("is_online").notNull().default(false),
  rating: numeric("rating", { precision: 3, scale: 2 }),
  totalRides: integer("total_rides").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),

  vehicleYear: text("vehicle_year"),
  vehicleMake: text("vehicle_make"),
  vehicleModel: text("vehicle_model"),
  vehicleColor: text("vehicle_color"),
  vehicleClass: text("vehicle_class"),
  passengerCapacity: integer("passenger_capacity"),
  luggageCapacity: integer("luggage_capacity"),
  hasCarSeat: boolean("has_car_seat").default(false),
  serviceArea: text("service_area"),

  licenseExpiry: text("license_expiry"),
  licenseDoc: text("license_doc"),

  regVin: text("reg_vin"),
  regPlate: text("reg_plate"),
  regExpiry: text("reg_expiry"),
  regDoc: text("reg_doc"),

  insuranceExpiry: text("insurance_expiry"),
  insuranceDoc: text("insurance_doc"),

  approvalStatus: text("approval_status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),

  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  locationUpdatedAt: timestamp("location_updated_at", { withTimezone: true }),
});

export const insertDriverSchema = createInsertSchema(driversTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof driversTable.$inferSelect;
