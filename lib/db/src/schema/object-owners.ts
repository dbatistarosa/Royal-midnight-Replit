import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * object_owners — who each private object belongs to.
 *
 * The private bucket holds driver licences, insurance certificates and vehicle
 * registrations. The storage routes used to authorise on "is there a session?"
 * alone, which meant any signed-up passenger could ask /storage/sign for an
 * arbitrary object path and download another driver's documents. Ownership is
 * recorded when the upload URL is issued and checked before signing and before
 * serving the bytes.
 *
 * Keyed by the internal `/objects/<uuid>` path — the same value stored in
 * compliance_documents.file_url and drivers.license_doc/reg_doc/insurance_doc.
 */
export const objectOwnersTable = pgTable("object_owners", {
  id: serial("id").primaryKey(),
  objectPath: text("object_path").notNull().unique(),
  ownerUserId: integer("owner_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("object_owners_owner_idx").on(t.ownerUserId)]);

export type ObjectOwner = typeof objectOwnersTable.$inferSelect;
