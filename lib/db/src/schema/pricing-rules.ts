import { pgTable, serial, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pricingRulesTable = pgTable("pricing_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  vehicleClass: text("vehicle_class"),
  baseFare: numeric("base_fare", { precision: 10, scale: 2 }).notNull(),
  ratePerMile: numeric("rate_per_mile", { precision: 10, scale: 2 }).notNull(),
  airportSurcharge: numeric("airport_surcharge", { precision: 10, scale: 2 }).notNull().default("15"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPricingRuleSchema = createInsertSchema(pricingRulesTable).omit({ id: true, createdAt: true });
export type InsertPricingRule = z.infer<typeof insertPricingRuleSchema>;
export type PricingRule = typeof pricingRulesTable.$inferSelect;
