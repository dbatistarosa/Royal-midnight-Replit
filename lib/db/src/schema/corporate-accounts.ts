import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A company-level billing account. One or more `users` rows (role="corporate") link
// to it via users.corporateAccountId — e.g. multiple executive assistants booking
// under the same company get pooled onto one invoice with one volume discount.
export const corporateAccountsTable = pgTable("corporate_accounts", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  billingEmail: text("billing_email").notNull(),
  billingAddress: text("billing_address"),
  netTermsDays: integer("net_terms_days").notNull().default(30),
  // Flat percentage applied to every ride's subtotal at quote time, e.g. "15" = 15% off.
  volumeDiscountPct: numeric("volume_discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  creditLimit: numeric("credit_limit", { precision: 10, scale: 2 }),
  status: text("status").notNull().default("active"), // active | suspended
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCorporateAccountSchema = createInsertSchema(corporateAccountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCorporateAccount = z.infer<typeof insertCorporateAccountSchema>;
export type CorporateAccount = typeof corporateAccountsTable.$inferSelect;
