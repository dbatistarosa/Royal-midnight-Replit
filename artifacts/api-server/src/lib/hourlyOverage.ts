/**
 * Billing an hourly charter that ran long.
 *
 * The infrastructure for this has been half-present for months: trip/start
 * freezes hourly_rate and max_miles_per_hour onto the booking "so the cron can
 * compute overage", trip/complete adds bookings.extra_charge to the total, and
 * the completion email has a line for it. Nothing ever computed the number.
 * Charters ran over and nobody was billed.
 *
 * The operator's rule, in their words:
 *
 *   - The timer starts when the passenger is picked up, not when the driver
 *     sets off and not at the scheduled pickup time.
 *   - Finishing early changes nothing: the contracted block is charged in full.
 *   - Running over by 20 minutes or less is free.
 *   - Past that, the next whole hour is charged, used or not.
 *
 * So this is a threshold plus a ceiling, not a pro-rata meter. 21 minutes over
 * costs a full hour; so does 59. That is deliberate and is what the customer is
 * told at booking — the alternative (per-minute) was considered and rejected.
 */

/** Overtime up to and including this many minutes is not charged. */
export const OVERAGE_GRACE_MINUTES = 20;

export type OverageInput = {
  /** When the passenger was actually picked up (bookings.trip_started_at). */
  startedAt: Date | string | null | undefined;
  /** When the driver ended the trip. Defaults to now. */
  endedAt?: Date | string | null | undefined;
  /** Hours the customer booked and paid for. */
  contractedHours: number | null | undefined;
  /** Rate frozen onto the booking at trip start. */
  hourlyRate: number | null | undefined;
};

export type OverageResult = {
  /** Minutes the passenger actually had the vehicle. */
  usedMinutes: number;
  /** Minutes beyond the contracted block. Never negative — finishing early is
   *  not a credit. */
  overtimeMinutes: number;
  /** Whole hours charged. 0 while inside the grace period. */
  billedHours: number;
  /** Money owed on top of the fare. */
  extraCharge: number;
  /** Why the charge is what it is, for the receipt and the admin screen. */
  reason: "not_hourly" | "not_started" | "within_contract" | "within_grace" | "overage";
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computeHourlyOverage(input: OverageInput): OverageResult {
  const none = (reason: OverageResult["reason"], usedMinutes = 0, overtimeMinutes = 0): OverageResult =>
    ({ usedMinutes, overtimeMinutes, billedHours: 0, extraCharge: 0, reason });

  const contractedHours = Number(input.contractedHours);
  const hourlyRate = Number(input.hourlyRate);
  if (!Number.isFinite(contractedHours) || contractedHours <= 0) return none("not_hourly");

  const startedAt = toDate(input.startedAt);
  if (!startedAt) return none("not_started");

  const endedAt = toDate(input.endedAt) ?? new Date();

  // A clock that runs backwards (clock skew, a corrected trip_started_at) must
  // not produce a negative charge or a negative duration.
  const usedMinutes = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 60_000));
  const contractedMinutes = contractedHours * 60;
  const overtimeMinutes = Math.max(0, usedMinutes - contractedMinutes);

  if (overtimeMinutes === 0) return none("within_contract", usedMinutes, 0);
  if (overtimeMinutes <= OVERAGE_GRACE_MINUTES) return none("within_grace", usedMinutes, overtimeMinutes);

  // Past the grace period the whole overrun is billed, rounded up to the next
  // full hour. The grace minutes are not deducted first: they are the threshold
  // that triggers billing, not a discount applied afterwards.
  const billedHours = Math.ceil(overtimeMinutes / 60);
  const rate = Number.isFinite(hourlyRate) && hourlyRate > 0 ? hourlyRate : 0;

  return {
    usedMinutes,
    overtimeMinutes,
    billedHours,
    extraCharge: round2(billedHours * rate),
    reason: "overage",
  };
}

/** Wording for the receipt and the admin screen. */
export function describeOverage(r: OverageResult): string | null {
  switch (r.reason) {
    case "overage":
      return `Ran ${r.overtimeMinutes} minutes past the booked time — ${r.billedHours} additional hour${r.billedHours === 1 ? "" : "s"} charged.`;
    case "within_grace":
      return `Ran ${r.overtimeMinutes} minutes past the booked time — within the ${OVERAGE_GRACE_MINUTES}-minute allowance, no charge.`;
    default:
      return null;
  }
}
