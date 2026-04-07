import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const ticketMessagesTable = pgTable("ticket_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  userId: integer("user_id"),
  authorRole: text("author_role").notNull().default("passenger"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TicketMessage = typeof ticketMessagesTable.$inferSelect;
