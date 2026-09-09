import { pgTable, serial, integer, text, numeric, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { bookingsTable } from "./bookings";
import { driversTable } from "./drivers";

export const bookingItineraryStopsTable = pgTable("booking_itinerary_stops", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  kind: text("kind").notNull(), // "stop" | "final"
  address: text("address").notNull(),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  arrivedAt: timestamp("arrived_at", { withTimezone: true }),
  departedAt: timestamp("departed_at", { withTimezone: true }),
  arrivedByDriverId: integer("arrived_by_driver_id").references(() => driversTable.id, { onDelete: "set null" }),
  departedByDriverId: integer("departed_by_driver_id").references(() => driversTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => ({
  bookingSequenceUnique: uniqueIndex("booking_itinerary_stops_booking_sequence_unique").on(table.bookingId, table.sequence),
  bookingProgressIndex: index("booking_itinerary_stops_booking_progress_idx").on(table.bookingId, table.arrivedAt),
}));

export type BookingItineraryStop = typeof bookingItineraryStopsTable.$inferSelect;
