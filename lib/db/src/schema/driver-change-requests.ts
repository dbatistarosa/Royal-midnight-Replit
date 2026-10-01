import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

/** Driver-owned changes remain pending until an administrator reviews them. */
export const driverChangeRequestsTable = pgTable("driver_change_requests", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull(),
  kind: text("kind").notNull(),
  payload: text("payload").notNull(),
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: integer("reviewed_by"),
});
