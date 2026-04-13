import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { driversTable } from "./drivers";

/**
 * compliance_documents — one row per driver per document submission.
 * A driver may have multiple rows for the same doc_type over time
 * (each renewal creates a new row).  The admin picks the "active" one
 * by setting status='approved' and writing the new expiry back to drivers.
 */
export const complianceDocumentsTable = pgTable("compliance_documents", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull().references(() => driversTable.id),
  /** "Driver License" | "Vehicle Registration" | "Insurance" */
  docType: text("doc_type").notNull(),
  /** "pending_review" | "approved" | "rejected" */
  status: text("status").notNull().default("pending_review"),
  /** Object-storage URL for the uploaded file */
  fileUrl: text("file_url").notNull(),
  /** New expiry date submitted by the driver (YYYY-MM-DD) */
  newExpiry: text("new_expiry"),
  /** Admin notes at review time */
  adminNotes: text("admin_notes"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ComplianceDocument = typeof complianceDocumentsTable.$inferSelect;
