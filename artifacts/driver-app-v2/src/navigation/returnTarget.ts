export type TripReturnTarget = "home" | "upcoming" | "completed" | "cancelled" | "alerts";

const VALID_TARGETS = new Set<TripReturnTarget>(["home", "upcoming", "completed", "cancelled", "alerts"]);

export function isTripReturnTarget(value: unknown): value is TripReturnTarget {
  return typeof value === "string" && VALID_TARGETS.has(value as TripReturnTarget);
}

export function buildTripHref(bookingId: number, returnTo: TripReturnTarget = "home"): string {
  return `/trip/${bookingId}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function returnRouteForTrip(value: unknown): string {
  if (value === "completed" || value === "cancelled" || value === "upcoming") {
    return `/(app)/trips?tab=${value}`;
  }
  if (value === "alerts") return "/(app)/notifications";
  return "/(app)";
}
