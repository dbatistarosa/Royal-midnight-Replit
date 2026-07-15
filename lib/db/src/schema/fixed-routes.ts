import { pgTable, serial, text, numeric, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export type AirportPriceEntry = {
  code: string;
  name: string;
  prices: Record<string, number>;
};

export const fixedRoutesTable = pgTable("fixed_routes", {
  id: serial("id").primaryKey(),
  originName: text("origin_name").notNull(),
  originAddress: text("origin_address").notNull(),
  destinationCode: text("destination_code").notNull(),
  destinationName: text("destination_name").notNull(),
  vehicleClass: text("vehicle_class").notNull().default("business"),
  fixedPrice: numeric("fixed_price", { precision: 10, scale: 2 }).notNull(),
  airportsJson: jsonb("airports_json").$type<AirportPriceEntry[]>(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
