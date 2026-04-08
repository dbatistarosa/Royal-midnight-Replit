import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  passengerName: text("passenger_name").notNull(),
  passengerEmail: text("passenger_email").notNull(),
  passengerPhone: text("passenger_phone").notNull(),
  pickupAddress: text("pickup_address").notNull(),
  dropoffAddress: text("dropoff_address").notNull(),
  pickupAt: timestamp("pickup_at", { withTimezone: true }).notNull(),
  vehicleClass: text("vehicle_class").notNull().default("standard"),
  passengers: integer("passengers").notNull().default(1),
  luggageCount: integer("luggage_count").notNull().default(0),
  flightNumber: text("flight_number"),
  specialRequests: text("special_requests"),
  status: text("status").notNull().default("pending"),
  priceQuoted: numeric("price_quoted", { precision: 10, scale: 2 }).notNull(),
  promoCode: text("promo_code"),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }),
  driverId: integer("driver_id"),
  vehicleId: integer("vehicle_id"),
  paymentType: text("payment_type").default("standard"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
