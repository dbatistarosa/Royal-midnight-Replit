import { pgTable, serial, integer, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { bookingsTable } from "./bookings";
import { driversTable } from "./drivers";

/**
 * booking_driver_blocks — trips a driver must never be offered again.
 *
 * When an assigned driver misses the confirmation deadline the trip goes back
 * to the open pool, but it has to go back to *everyone else*. Without this the
 * driver who just lost it would see it reappear in their own pool seconds
 * later.
 */
export const bookingDriverBlocksTable = pgTable("booking_driver_blocks", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  driverId: integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
  reason: text("reason").notNull().default("no_confirmation"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("booking_driver_blocks_booking_driver_unique").on(t.bookingId, t.driverId),
  index("booking_driver_blocks_driver_idx").on(t.driverId),
]);

export type BookingDriverBlock = typeof bookingDriverBlocksTable.$inferSelect;

/**
 * driver_warnings — non-compliance history.
 *
 * Stored as rows rather than a counter on drivers so the admin can see which
 * trips caused them. Three warnings suspends the driver automatically.
 */
export const driverWarningsTable = pgTable("driver_warnings", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
  bookingId: integer("booking_id").references(() => bookingsTable.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("driver_warnings_driver_idx").on(t.driverId)]);

export type DriverWarning = typeof driverWarningsTable.$inferSelect;

/** Warnings after which a driver is suspended automatically. */
export const WARNINGS_BEFORE_SUSPENSION = 3;
