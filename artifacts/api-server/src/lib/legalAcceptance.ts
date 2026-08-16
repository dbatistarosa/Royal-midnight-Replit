import type { Request } from "express";
import { db, legalAcceptancesTable, LEGAL_VERSIONS, type LegalDocumentType } from "@workspace/db";
import { tableExists } from "./schemaGuards.js";

/**
 * Recording an acceptance.
 *
 * Deliberately never throws and never blocks the request that triggered it. The
 * acceptance is evidence gathered alongside an action the user already
 * completed — a booking that was paid for, an onboarding that finished — and
 * failing that action because the audit write failed would trade a real
 * outcome for a record of it.
 *
 * That is a real trade-off, not an oversight: if the table is missing
 * (migration 0010 not yet applied) or the insert fails, the action stands and
 * the failure is logged. The alternative — refusing bookings because an audit
 * row could not be written — is worse for everyone including the operator.
 */

type Subject = {
  documentType: LegalDocumentType;
  userId?: number | null;
  driverId?: number | null;
  bookingId?: number | null;
  email?: string | null;
};

/**
 * The caller's address as express resolved it. `trust proxy` is set to one hop
 * in app.ts, so on Vercel this is the client rather than the edge.
 */
function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

function userAgent(req: Request): string | null {
  const ua = req.get("user-agent");
  // Long enough to identify a browser, short enough that a hostile header
  // cannot be used to write megabytes into the table.
  return ua ? ua.slice(0, 400) : null;
}

export async function recordAcceptance(req: Request, subject: Subject): Promise<void> {
  try {
    if (!(await tableExists("public.legal_acceptances"))) {
      req.log?.warn(
        { documentType: subject.documentType },
        "legal_acceptance_table_missing",
      );
      return;
    }
    await db.insert(legalAcceptancesTable).values({
      documentType: subject.documentType,
      documentVersion: LEGAL_VERSIONS[subject.documentType],
      userId: subject.userId ?? null,
      driverId: subject.driverId ?? null,
      bookingId: subject.bookingId ?? null,
      email: subject.email ?? null,
      ipAddress: clientIp(req),
      userAgent: userAgent(req),
    });
  } catch (err) {
    req.log?.error(
      { documentType: subject.documentType, err: (err as Error).message },
      "legal_acceptance_write_failed",
    );
  }
}

/**
 * Record several documents accepted by one act — a passenger ticking a single
 * box that covers Terms, Privacy and the cancellation policy agrees to each of
 * them, and each is stored separately so a later amendment to one does not
 * blur which wording was actually accepted.
 */
export async function recordAcceptances(
  req: Request,
  documentTypes: LegalDocumentType[],
  subject: Omit<Subject, "documentType">,
): Promise<void> {
  for (const documentType of documentTypes) {
    await recordAcceptance(req, { ...subject, documentType });
  }
}

export { LEGAL_VERSIONS };
