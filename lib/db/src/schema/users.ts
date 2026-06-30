import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  role: text("role").notNull().default("passenger"),
  passwordHash: text("password_hash"),
  stripeCustomerId: text("stripe_customer_id"),
  defaultPaymentMethodId: text("default_payment_method_id"),
  // ── Cabin Preference Center ───────────────────────────────────────────────
  // Shown to the assigned chauffeur on their trip manifest so the vehicle
  // is staged to the passenger's exact standards before arrival.
  cabinTempF: integer("cabin_temp_f"),               // preferred temperature in °F (e.g. 70)
  musicPreference: text("music_preference"),          // e.g. "Jazz", "None", "Classical"
  quietRide: boolean("quiet_ride").default(false),    // prefers no conversation
  preferredBeverage: text("preferred_beverage"),      // e.g. "Sparkling Water"
  opensOwnDoor: boolean("opens_own_door").default(false), // chauffeur should not open door
  addressTitle: text("address_title"),                // e.g. "Dr.", "Mr.", "Ms."
  // ── Admin VIP Notes ───────────────────────────────────────────────────────
  // Permanent admin-only notes about this passenger (e.g. "CEO of Acme Corp").
  // Never visible to the passenger; shown discreetly on the driver trip manifest.
  vipNotes: text("vip_notes"),
  // ── Referral Program ─────────────────────────────────────────────────────
  referralCode: text("referral_code").unique(),         // this user's own shareable code
  referredByUserId: integer("referred_by_user_id"),      // set at signup if they used someone else's code
  referralRewardedAt: timestamp("referral_rewarded_at", { withTimezone: true }), // when the referrer was paid out for this user
  // Links a role="corporate" user to their company's billing account (Net-30 terms,
  // volume discount). Multiple users can share one corporate account.
  corporateAccountId: integer("corporate_account_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
