import { describe, it, expect } from "vitest";
import { computeHourlyOverage, describeOverage, OVERAGE_GRACE_MINUTES } from "./hourlyOverage";
import { computePostTripCharge } from "./pricing";

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

describe("booking #13 — the charter that was billed pro-rata and never charged", () => {
  // The real trip: picked up 16:43:16Z, ended 20:09:51Z on a 3-hour block at
  // $75/h. It was billed $32.16 (26 minutes x $1.25/min) and no card was ever
  // presented. This locks what /bookings/:id/collect-extra-time recomputes.
  const pickedUp = new Date("2026-08-17T16:43:16.824Z");
  const ended = new Date("2026-08-17T20:09:51.332Z");

  const overage = computeHourlyOverage({
    startedAt: pickedUp,
    endedAt: ended,
    contractedHours: 3,
    hourlyRate: 75,
  });

  it("ran 26 minutes over, which is past the allowance", () => {
    expect(overage.overtimeMinutes).toBe(26);
    expect(overage.overtimeMinutes).toBeGreaterThan(OVERAGE_GRACE_MINUTES);
    expect(overage.reason).toBe("overage");
  });

  it("bills one whole hour, not 26 minutes of it", () => {
    expect(overage.billedHours).toBe(1);
    expect(overage.extraCharge).toBe(75);
    // What the pro-rata meter produced, for contrast.
    expect(Math.round(26 * (75 / 60) * 100) / 100).toBe(32.5);
  });

  it("comes to $83.46 on the card once tax and the card fee are added", () => {
    const charge = computePostTripCharge({
      fare: overage.extraCharge,
      taxRate: 0.07,
      cardProcessingFeeRate: 0.04,
    });
    expect(charge.fare).toBe(75);
    expect(charge.taxAmount).toBeCloseTo(5.25, 2);
    expect(charge.cardProcessingFee).toBeCloseTo(3.21, 2);
    expect(charge.total).toBeCloseTo(83.46, 2);
  });
});
