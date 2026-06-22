import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const messageEventsTable = pgTable("message_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  messageId: text("message_id"),
  channel: text("channel"),
  toPhone: text("to_phone"),
  fromPhone: text("from_phone"),
  messageStatus: text("message_status"),
  rawPayload: jsonb("raw_payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMessageEventSchema = createInsertSchema(messageEventsTable).omit({ id: true, receivedAt: true });
export type InsertMessageEvent = z.infer<typeof insertMessageEventSchema>;
export type MessageEvent = typeof messageEventsTable.$inferSelect;
