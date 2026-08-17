/**
 * May this chauffeur work right now?
 *
 * The answer was spelled out separately at each gate — the open-pool query and
 * POST /bookings/:id/accept each wrote their own
 * `approvalStatus !== "approved" || complianceHold`. Both forgot the same
 * thing.
 *
 * The three-warning suspension in tripReminders.ts sets `drivers.status` to
 * "paused" and emails the driver "your account has been suspended". No read
 * path anywhere consulted that column: the pool gated on approvalStatus and
 * complianceHold, the accept route used the same two, and every other reference
 * to `status` compared it against "available" for broadcast targeting. A
 * suspended driver could still sign in, load the trip pool, and accept work —
 * the suspension existed only in the email.
 *
 * One function, used by every gate, so a new reason to stop a driver working
 * has exactly one place to be added and cannot be added to only half of them.
 */

/** Statuses that mean the account is stopped, as opposed to merely not free.
 *  "busy" and "offline" are availability, not discipline. */
const SUSPENDED_STATUSES = new Set(["paused", "suspended", "inactive"]);

export type DriverEligibilityInput = {
  approvalStatus?: string | null;
  complianceHold?: boolean | null;
  status?: string | null;
};

export type DriverBlockReason = "not_approved" | "compliance_hold" | "suspended";

/**
 * Returns why the driver may not work, or null when they may.
 *
 * Order matters only for the message shown; any one of them is disqualifying.
 */
export function driverBlockReason(d: DriverEligibilityInput): DriverBlockReason | null {
  if (d.approvalStatus !== "approved") return "not_approved";
  if (d.complianceHold) return "compliance_hold";
  if (d.status != null && SUSPENDED_STATUSES.has(d.status)) return "suspended";
  return null;
}

export function canDriverWork(d: DriverEligibilityInput): boolean {
  return driverBlockReason(d) === null;
}

/** What to tell the driver. Deliberately specific: "not available" for a
 *  compliance hold sends them looking in the wrong place. */
export function driverBlockMessage(reason: DriverBlockReason): string {
  switch (reason) {
    case "not_approved":
      return "Your chauffeur account has not been approved yet.";
    case "compliance_hold":
      return "Your account is on a compliance hold due to an expired document. Please upload a renewed document to resume accepting rides.";
    case "suspended":
      return "Your account is suspended. Please contact the office to be reinstated.";
  }
}
