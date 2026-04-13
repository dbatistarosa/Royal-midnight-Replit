import { pgTable, integer, text, timestamp, primaryKey } from "drizzle-orm/pg-core";

/**
 * Executive Assistants (EAs) and their linked travelers.
 * An EA user can book, track, and cancel on behalf of linked travelers.
 * Admin creates these relationships; travelers can also grant access from their profile.
 */
export const managedTravelersTable = pgTable(
  "managed_travelers",
  {
    eaUserId: integer("ea_user_id").notNull(),
    travelerId: integer("traveler_id").notNull(),
    /** Display name of the traveler shown in the "Booking for" switcher */
    travelerName: text("traveler_name"),
    /** Email cached for display — kept in sync when traveler profile updates */
    travelerEmail: text("traveler_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eaUserId, t.travelerId] })]
);

export type ManagedTraveler = typeof managedTravelersTable.$inferSelect;
