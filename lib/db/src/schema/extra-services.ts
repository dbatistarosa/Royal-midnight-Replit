import { pgTable, serial, integer, text, numeric, boolean } from "drizzle-orm/pg-core";
import { timestamp } from "drizzle-orm/pg-core";

export const extraServicesTable = pgTable("extra_services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("amenity"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  icon: text("icon"),
  /**
   * Does this add-on's price go to the chauffeur in full, rather than into the
   * company's revenue?
   *
   * Some extras are work the chauffeur personally does or equipment they
   * supply — carrying a pet, fitting a child seat — and those are theirs
   * outright, with no commission taken. Champagne and flowers are goods the
   * company buys, so they are not.
   *
   * A column rather than a hardcoded list of names or ids, because which
   * add-ons work this way is a business decision the operator changes from the
   * Extras screen, and because matching on a name breaks the moment one is
   * renamed.
   */
  paidToDriver: boolean("paid_to_driver").notNull().default(false),
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
