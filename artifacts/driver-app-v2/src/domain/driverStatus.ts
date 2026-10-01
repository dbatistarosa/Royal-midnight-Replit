export type DriverAvailability = "available" | "on_break" | "unavailable";
export type DriverDisplayStatus = DriverAvailability | "on_duty";

export function displayDriverStatus(status: string | null | undefined, hasActiveTrip: boolean): DriverDisplayStatus {
  // A confirmed reservation is a commitment, not live duty. On Duty starts
  // only after the driver begins travelling to pickup and remains active
  // through arrival and the trip itself.
  if (hasActiveTrip) return "on_duty";
  if (status === "active") return "available";
  if (status === "available" || status === "on_break" || status === "unavailable") return status;
  return "unavailable";
}

export function canChangeAvailability(next: DriverAvailability, hasActiveTrip: boolean): boolean {
  return !hasActiveTrip || next === "available";
}
