import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * otp_codes — one live SMS login code per phone number.
 *
 * This table existed but was never used: the codes lived in a module-level Map.
 * On Vercel every instance keeps its own Map, so a verify could land on an
 * instance that never saw the send (login by SMS was intermittent by design),
 * and the per-code attempt ceiling was counted per instance, so the real limit
 * was 5 x however many instances happened to be warm.
 *
 * The code itself is never stored — only its SHA-256 — so a read of this table
 * does not hand over a working login factor.
 */
export const otpCodesTable = pgTable("otp_codes", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  otpHash: text("otp_hash").notNull(),
  /** Incremented atomically on every verify so the ceiling holds across instances. */
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OtpCode = typeof otpCodesTable.$inferSelect;
