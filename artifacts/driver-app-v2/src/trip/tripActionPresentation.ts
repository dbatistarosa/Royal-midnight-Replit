export const CHECKLIST_ITEMS = [
  "Vehicle is clean and detailed",
  "Vehicle is fueled (>¼ tank)",
  "Cabin temperature set to passenger preference",
  "Refreshments / requested amenities prepared",
  "Dress code / uniform is appropriate",
] as const;

export type TripAction = "checklist" | "on_way" | "on_location" | "start" | "complete" | "none";

export function nextTripAction(status: string, checklistCompletedAt: string | null | undefined): TripAction {
  if (status === "confirmed") return checklistCompletedAt ? "on_way" : "checklist";
  if (status === "on_way") return "on_location";
  if (status === "on_location") return "start";
  if (status === "in_progress") return "complete";
  return "none";
}

export function formatTripActionError(error: unknown): string {
  if (error && typeof error === "object") {
    const candidate = error as { status?: unknown; message?: unknown };
    if (typeof candidate.status === "number" && typeof candidate.message === "string" && candidate.message.trim()) {
      return candidate.message;
    }
  }

  if (error instanceof TypeError) {
    return "Could not reach the server. Check your connection and try again.";
  }

  return "Could not update this trip. Please try again.";
}
