/**
 * The shared driver-facing booking shape. Route handlers may load different
 * related rows, but they must use these same presentation and privacy rules.
 */

export function maskPassengerName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`;
}

type DriverHiddenMoneyField =
  | "priceQuoted"
  | "fareSubtotal"
  | "hourlyRate"
  | "extraMileRate"
  | "extraCharge"
  | "totalPrice";

export function toDriverView<T extends {
  priceQuoted: number;
  fareSubtotal: number;
  commissionPct?: string | null;
  hourlyRate?: unknown;
  extraMileRate?: unknown;
  extraCharge?: unknown;
  totalPrice?: unknown;
}>(
  booking: T,
  commissionPct: number,
  opts: { driverExtras?: number; overtimeFare?: number } = {},
): Omit<T, DriverHiddenMoneyField> & {
  driverEarnings: number;
  driverFareEarnings: number;
  driverExtrasEarnings: number;
  driverOvertimeEarnings: number;
} {
  const {
    priceQuoted: _priceQuoted,
    fareSubtotal,
    hourlyRate: _hourlyRate,
    extraMileRate: _extraMileRate,
    extraCharge: _extraCharge,
    totalPrice: _totalPrice,
    ...rest
  } = booking;
  const effectiveCommission = booking.commissionPct != null ? Number(booking.commissionPct) : commissionPct;
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const driverFareEarnings = round2(fareSubtotal * effectiveCommission);
  const driverOvertimeEarnings = round2((opts.overtimeFare ?? 0) * effectiveCommission);
  const driverExtrasEarnings = round2(opts.driverExtras ?? 0);
  return {
    ...rest,
    driverFareEarnings,
    driverOvertimeEarnings,
    driverExtrasEarnings,
    driverEarnings: round2(driverFareEarnings + driverOvertimeEarnings + driverExtrasEarnings),
  };
}

/**
 * Only completed trips may expose an overtime payout. The settled fare comes
 * from the dedicated overage column; the legacy extra_charge fallback is kept
 * for old completed rows where that column did not exist yet.
 */
export function driverOvertimeFareForBooking(
  booking: { status?: string | null },
  settledFare: number | null | undefined,
  legacyExtraCharge: unknown,
): number {
  if (booking.status !== "completed") return 0;
  if (settledFare != null && Number.isFinite(Number(settledFare))) return Math.max(0, Number(settledFare));
  const legacy = Number(legacyExtraCharge ?? 0);
  return Number.isFinite(legacy) ? Math.max(0, legacy) : 0;
}

export type DriverBookingDetails = {
  extras: unknown[];
  itinerary: unknown[];
  passengerPreferences?: unknown | null;
  driverReview?: {
    rating: number;
    comment: string | null;
    createdAt: string;
  } | null;
};

export function normalizePassengerEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

/**
 * Keep the driver-facing preference gate aligned with the web portal.
 * `opensOwnDoor` is an explicit choice, so `false` is meaningful and must not
 * be discarded as if the passenger had never set a preference.
 */
export function hasPassengerPreferences(preferences: Record<string, unknown> | null | undefined): boolean {
  if (!preferences) return false;
  return (
    preferences.cabinTempF != null
    || Boolean(preferences.musicPreference)
    || preferences.quietRide === true
    || Boolean(preferences.preferredBeverage)
    || preferences.opensOwnDoor != null
    || Boolean(preferences.addressTitle)
    || Boolean(preferences.vipNotes)
  );
}

export function enrichDriverBooking<T extends object>(view: T, details: DriverBookingDetails): T & DriverBookingDetails {
  return { ...view, ...details };
}

type OpenPoolPrivacyMask = {
  passengerName: string;
  passengerEmail: null;
  passengerPhone: null;
  specialRequests: null;
  passengerPreferences: null;
};

export function maskOpenPoolBooking<T extends object>(view: T, passengerName: unknown): Omit<T, keyof OpenPoolPrivacyMask> & OpenPoolPrivacyMask {
  return {
    ...view,
    passengerName: maskPassengerName(passengerName),
    passengerEmail: null,
    passengerPhone: null,
    specialRequests: null,
    passengerPreferences: null,
  };
}
