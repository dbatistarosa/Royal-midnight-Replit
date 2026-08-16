import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * legal_acceptances — who agreed to what, when, and from where.
 *
 * An agreement nobody can prove was accepted is not much of an agreement. The
 * site had Terms and a Privacy Policy as pages, but nothing anywhere recorded a
 * passenger accepting them at booking time, and there was no chauffeur
 * agreement at all — drivers were onboarded, approved and dispatched without
 * ever being shown terms.
 *
 * One table rather than a timestamp column per document, for two reasons. It
 * records *which version* was accepted, so amending a document later does not
 * rewrite history or silently claim that everyone agreed to the new text. And
 * a new table can ship ahead of its migration safely — adding columns to
 * `bookings` or `drivers` cannot, because drizzle expands every select over the
 * declared columns and a missing one takes the whole table's queries down (see
 * the note in schema/bookings.ts).
 *
 * Subject columns are all nullable and exactly one is normally set:
 *   userId    — a passenger or chauffeur accepting on their own account
 *   driverId  — the chauffeur agreement, at onboarding
 *   bookingId — terms accepted for one specific reservation
 */
export const legalAcceptancesTable = pgTable("legal_acceptances", {
  id: serial("id").primaryKey(),

  /** "driver_agreement" | "terms" | "privacy" | "trip_terms" */
  documentType: text("document_type").notNull(),
  /** Dated version string, e.g. "2026-08-16". Never reuse one after an edit. */
  documentVersion: text("document_version").notNull(),

  userId: integer("user_id"),
  driverId: integer("driver_id"),
  bookingId: integer("booking_id"),

  /** Denormalised so an acceptance stays attributable even if the account is
   *  later deleted or its email changed. */
  email: text("email"),

  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  /** Evidence of the act, not tracking: the pair that makes an acceptance
   *  defensible if it is ever disputed. */
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (t) => [
  index("legal_acceptances_user_idx").on(t.userId),
  index("legal_acceptances_driver_idx").on(t.driverId),
  index("legal_acceptances_booking_idx").on(t.bookingId),
]);

export type LegalAcceptance = typeof legalAcceptancesTable.$inferSelect;

/**
 * Current version of each document. Bump the date when the text materially
 * changes — the stored value is what proves which wording someone agreed to.
 */
export const LEGAL_VERSIONS = {
  driver_agreement: "2026-08-16",
  terms: "2026-08-16",
  privacy: "2026-08-16",
  trip_terms: "2026-08-16",
} as const;

export type LegalDocumentType = keyof typeof LEGAL_VERSIONS;
