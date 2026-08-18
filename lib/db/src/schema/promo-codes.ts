import { pgTable, serial, text, numeric, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const promoCodesTable = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  description: text("description").notNull(),
  discountType: text("discount_type").notNull().default("percentage"),
  discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull(),
  minBookingAmount: numeric("min_booking_amount", { precision: 10, scale: 2 }),
  /** Global cap: total redemptions across everybody. NULL = unlimited. */
  maxUses: integer("max_uses"),
  /** Per-person cap: how many times ONE passenger may use this code.
   *  NULL = unlimited, which is what every code did before this existed.
   *  Counted from the passenger's own bookings carrying the code, so a code
   *  with this set can only be honoured for a signed-in passenger. */
  maxUsesPerUser: integer("max_uses_per_user"),
  usedCount: integer("used_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPromoCodeSchema = createInsertSchema(promoCodesTable).omit({ id: true, createdAt: true, usedCount: true });
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type PromoCode = typeof promoCodesTable.$inferSelect;
