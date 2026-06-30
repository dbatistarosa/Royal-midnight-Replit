import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const driverVehiclesTable = pgTable("driver_vehicles", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull(),
  year: text("year"),
  make: text("make"),
  model: text("model"),
  color: text("color"),
  vehicleClass: text("vehicle_class"),
  passengerCapacity: integer("passenger_capacity"),
  luggageCapacity: integer("luggage_capacity"),
  hasCarSeat: boolean("has_car_seat").notNull().default(false),
  regPlate: text("reg_plate"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
