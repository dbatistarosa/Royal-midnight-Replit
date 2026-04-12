import { pgTable, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";

/**
 * Passengers can save up to N chauffeurs as "favorites".
 * On the booking form they can optionally request their favorite driver
 * if that driver is available for the chosen date/time.
 */
export const userFavoriteDriversTable = pgTable(
  "user_favorite_drivers",
  {
    userId: integer("user_id").notNull(),
    driverId: integer("driver_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.driverId] })]
);
