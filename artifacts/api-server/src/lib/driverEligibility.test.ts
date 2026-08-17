import { describe, it, expect } from "vitest";
import { driverBlockReason, canDriverWork, driverBlockMessage } from "./driverEligibility";

/**
 * The bug this pins down: the three-warning rule set drivers.status to "paused"
 * and emailed the driver "your account has been suspended", but no read path
 * consulted that column. The open pool and the accept route both gated on
 * approvalStatus and complianceHold only, so a suspended driver kept full
 * access — the suspension existed nowhere except in the email.
 */

const ok = { approvalStatus: "approved", complianceHold: false, status: "available" };

describe("driverBlockReason", () => {
  it("lets an approved, compliant, active driver work", () => {
    expect(driverBlockReason(ok)).toBeNull();
    expect(canDriverWork(ok)).toBe(true);
  });

  it("blocks a driver suspended by the three-warning rule", () => {
    // tripReminders.ts writes exactly this value.
    expect(driverBlockReason({ ...ok, status: "paused" })).toBe("suspended");
    expect(canDriverWork({ ...ok, status: "paused" })).toBe(false);
  });

  it("blocks the other administrative stop states too", () => {
    for (const status of ["suspended", "inactive"]) {
      expect(driverBlockReason({ ...ok, status })).toBe("suspended");
    }
  });

  it("does NOT treat mere unavailability as a block", () => {
    // "busy" and "offline" are where the driver is, not whether they may work.
    // Confusing the two would hide the pool from every driver between trips.
    for (const status of ["available", "busy", "offline", "pending"]) {
      expect(driverBlockReason({ ...ok, status })).toBeNull();
    }
  });

  it("blocks an unapproved driver", () => {
    expect(driverBlockReason({ ...ok, approvalStatus: "pending" })).toBe("not_approved");
    expect(driverBlockReason({ ...ok, approvalStatus: "rejected" })).toBe("not_approved");
  });

  it("blocks a driver on a compliance hold", () => {
    expect(driverBlockReason({ ...ok, complianceHold: true })).toBe("compliance_hold");
  });

  it("tolerates missing fields without accidentally allowing work", () => {
    expect(driverBlockReason({})).toBe("not_approved");
    expect(driverBlockReason({ approvalStatus: "approved" })).toBeNull();
    expect(driverBlockReason({ approvalStatus: "approved", status: null })).toBeNull();
  });

  it("gives each reason its own message rather than a generic one", () => {
    const messages = (["not_approved", "compliance_hold", "suspended"] as const).map(driverBlockMessage);
    expect(new Set(messages).size).toBe(3);
    expect(driverBlockMessage("compliance_hold")).toMatch(/document/i);
    expect(driverBlockMessage("suspended")).toMatch(/suspended/i);
  });
});
