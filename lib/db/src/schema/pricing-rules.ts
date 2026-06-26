import { pgTable, serial, text, numeric, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pricingRulesTable = pgTable("pricing_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  vehicleClass: text("vehicle_class"),
  baseFare: numeric("base_fare", { precision: 10, scale: 2 }).notNull(),
  ratePerMile: numeric("rate_per_mile", { precision: 10, scale: 2 }).notNull(),
  includedMiles: numeric("included_miles", { precision: 10, scale: 1 }).notNull().default("0"),
  airportSurcharge: numeric("airport_surcharge", { precision: 10, scale: 2 }).notNull().default("15"),
  // Hourly charter rate — admin-editable; quote.ts falls back to a hardcoded default only
  // when a vehicle class has no active rule at all.
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
  // Display fields — when set, this rule also defines a public, bookable vehicle class
  // shown on /fleet, /pricing, and the vehicle picker in /book. A rule with vehicleClass
  // set but these left empty is treated as fare-only (not shown publicly as a class).
  description: text("description"),
  category: text("category"),
  passengers: integer("passengers"),
  bags: integer("bags"),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPricingRuleSchema = createInsertSchema(pricingRulesTable).omit({ id: true, createdAt: true });
export type InsertPricingRule = z.infer<typeof insertPricingRuleSchema>;
export type PricingRule = typeof pricingRulesTable.$inferSelect;
