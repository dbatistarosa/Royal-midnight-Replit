import { describe, it, expect } from "vitest";
import { computeHourlyOverage, describeOverage, OVERAGE_GRACE_MINUTES } from "./hourlyOverage";

/**
 * The operator's rule, worked as the example they were shown:
 * a 3-hour charter at $75/h, kept 3h35m, costs $75 extra — the next whole hour,
 * because 35 minutes is past the 20-minute allowance.
 */

const start = new Date("2026-08-17T14:00:00Z");
const after = (h: number, m = 0) => new Date(start.getTime() + h * 3_600_000 + m * 60_000);

const run = (endedAt: Date, contractedHours = 3, hourlyRate = 75) =>
  computeHourlyOverage({ startedAt: start, endedAt, contractedHours, hourlyRate });

describe("computeHourlyOverage", () => {
  it("charges a full hour for the operator's worked example (3h charter, 3h35m used)", () => {
    const r = run(after(3, 35));
    expect(r.overtimeMinutes).toBe(35);
    expect(r.billedHours).toBe(1);
    expect(r.extraCharge).toBe(75);
    expect(r.reason).toBe("overage");
  });

  it("charges nothing when the trip finishes early — the block is paid for either way", () => {
    const r = run(after(2, 10));
    expect(r.overtimeMinutes).toBe(0);
    expect(r.extraCharge).toBe(0);
    expect(r.reason).toBe("within_contract");
  });

  it("charges nothing at exactly the contracted time", () => {
    expect(run(after(3, 0)).extraCharge).toBe(0);
  });

  it("treats the grace period as inclusive — 20 minutes over is free, 21 is not", () => {
    const free = run(after(3, OVERAGE_GRACE_MINUTES));
    expect(free.extraCharge).toBe(0);
    expect(free.reason).toBe("within_grace");

    const charged = run(after(3, OVERAGE_GRACE_MINUTES + 1));
    expect(charged.extraCharge).toBe(75);
    expect(charged.reason).toBe("overage");
  });

  it("bills the whole overrun, not the part beyond the allowance", () => {
    // 59 minutes over is still one hour, not (59-20)/60 of one.
    expect(run(after(3, 59)).billedHours).toBe(1);
    // 61 minutes over rounds up to two.
    expect(run(after(4, 1)).billedHours).toBe(2);
    expect(run(after(4, 1)).extraCharge).toBe(150);
  });

  it("rounds each further overrun up to the next whole hour", () => {
    expect(run(after(5, 5)).billedHours).toBe(3);
    expect(run(after(6, 0)).billedHours).toBe(3);
    expect(run(after(6, 1)).billedHours).toBe(4);
  });

  it("uses the rate frozen on the booking, whatever it is", () => {
    expect(run(after(3, 30), 3, 125).extraCharge).toBe(125);
    expect(run(after(3, 30), 3, 95).extraCharge).toBe(95);
  });

  it("charges nothing on a booking that is not an hourly charter", () => {
    expect(computeHourlyOverage({ startedAt: start, endedAt: after(9), contractedHours: null, hourlyRate: 75 }).reason)
      .toBe("not_hourly");
    expect(computeHourlyOverage({ startedAt: start, endedAt: after(9), contractedHours: 0, hourlyRate: 75 }).extraCharge)
      .toBe(0);
  });

  it("charges nothing when the trip never started", () => {
    const r = computeHourlyOverage({ startedAt: null, endedAt: after(9), contractedHours: 3, hourlyRate: 75 });
    expect(r.reason).toBe("not_started");
    expect(r.extraCharge).toBe(0);
  });

  it("never produces a negative charge or duration if the clock runs backwards", () => {
    const r = computeHourlyOverage({ startedAt: after(3), endedAt: start, contractedHours: 3, hourlyRate: 75 });
    expect(r.usedMinutes).toBe(0);
    expect(r.overtimeMinutes).toBe(0);
    expect(r.extraCharge).toBe(0);
  });

  it("bills nothing when the rate is missing rather than guessing one", () => {
    const r = computeHourlyOverage({ startedAt: start, endedAt: after(4), contractedHours: 3, hourlyRate: null });
    expect(r.billedHours).toBe(1);
    expect(r.extraCharge).toBe(0);
  });

  it("accepts ISO strings as well as Dates", () => {
    const r = computeHourlyOverage({
      startedAt: start.toISOString(),
      endedAt: after(3, 35).toISOString(),
      contractedHours: 3,
      hourlyRate: 75,
    });
    expect(r.extraCharge).toBe(75);
  });

  it("explains a charge, and stays silent when there is nothing to explain", () => {
    expect(describeOverage(run(after(3, 35)))).toMatch(/35 minutes.*1 additional hour/);
    expect(describeOverage(run(after(3, 10)))).toMatch(/no charge/);
    expect(describeOverage(run(after(2, 0)))).toBeNull();
  });
});
