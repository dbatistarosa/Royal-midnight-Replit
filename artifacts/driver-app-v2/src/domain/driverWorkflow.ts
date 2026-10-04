export type WorkflowAction = "checklist" | "on_way" | "on_location" | "start" | "complete" | "none";

export interface WorkflowConfig {
  confirmWindowMinutes: number;
  releaseMinutes: number;
  graceMinutes: number;
}

type TripForAction = { status: string; checklistCompletedAt?: string | null };
type TripForWindow = TripForAction & { pickupAt: string };
type ItineraryProgress = { sequence: number; kind?: string; arrivedAt?: string | null; departedAt?: string | null };

export function actionForTrip(trip: TripForAction): WorkflowAction {
  if (trip.status === "confirmed") return trip.checklistCompletedAt ? "on_way" : "checklist";
  if (trip.status === "on_way") return "on_location";
  if (trip.status === "on_location") return "start";
  if (trip.status === "in_progress") return "complete";
  return "none";
}

export function minutesUntilPickup(pickupAt: string, now = Date.now()): number {
  return (Date.parse(pickupAt) - now) / 60_000;
}

export function canGoOnWay(trip: TripForWindow, config: WorkflowConfig, now = Date.now()): boolean {
  if (actionForTrip(trip) !== "on_way") return false;
  return minutesUntilPickup(trip.pickupAt, now) <= config.confirmWindowMinutes;
}

export function formatOnWayAvailability(minutes: number, config: WorkflowConfig): string {
  if (minutes <= config.confirmWindowMinutes) return "On the Way is available now";
  const remaining = Math.max(1, Math.ceil(minutes - config.confirmWindowMinutes));
  return `On the Way available in ${remaining} ${remaining === 1 ? "minute" : "minutes"}`;
}

export function nextItineraryAction(stops: ItineraryProgress[]): { sequence: number; action: "arrive" | "depart" } | null {
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  const nextStop = ordered.find((stop) => stop.kind !== "final" && !stop.departedAt);
  if (nextStop) return { sequence: nextStop.sequence, action: nextStop.arrivedAt ? "depart" : "arrive" };
  const finalDestination = ordered.find((stop) => stop.kind === "final" && !stop.arrivedAt);
  return finalDestination ? { sequence: finalDestination.sequence, action: "arrive" } : null;
}

export function canCompleteHourlyTrip(stops: ItineraryProgress[] | undefined): boolean {
  if (!stops?.length) return false;
  const finalDestination = stops.find((stop) => stop.kind === "final");
  return !!finalDestination?.arrivedAt
    && stops.filter((stop) => stop.kind !== "final").every((stop) => !!stop.departedAt);
}
