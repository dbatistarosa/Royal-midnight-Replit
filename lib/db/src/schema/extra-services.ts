import { pgTable, serial, integer, text, numeric, boolean } from "drizzle-orm/pg-core";
import { timestamp } from "drizzle-orm/pg-core";

export const extraServicesTable = pgTable("extra_services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("amenity"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  icon: text("icon"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookingExtrasTable = pgTable("booking_extras", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  extraServiceId: integer("extra_service_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  priceAtBooking: numeric("price_at_booking", { precision: 10, scale: 2 }).notNull(),
});
