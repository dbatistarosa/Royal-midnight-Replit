export type TripWindowInput = {
  pickupAt: Date | string;
  estimatedDurationMinutes?: number | null;
  charterMode?: string | null;
  charterHours?: number | null;
};
export const TRIP_BUFFER_MS = 60 * 60_000;
export function tripDurationMinutes(trip: TripWindowInput): number {
  return Math.max(
    1,
    trip.estimatedDurationMinutes ?? 60,
    trip.charterMode === "hourly" ? (trip.charterHours ?? 0) * 60 : 0,
  );
}
export function tripConflicts(
  candidate: TripWindowInput,
  existing: TripWindowInput[],
): boolean {
  const start = new Date(candidate.pickupAt).getTime();
  const end = start + tripDurationMinutes(candidate) * 60_000;
  return existing.some((trip) => {
    const otherStart = new Date(trip.pickupAt).getTime();
    const otherEnd = otherStart + tripDurationMinutes(trip) * 60_000;
    return (
      start < otherEnd + TRIP_BUFFER_MS && end > otherStart - TRIP_BUFFER_MS
    );
  });
}

/** Higher fleet categories may serve a lower category reservation. This is
 * directional: an SUV can cover a sedan request, while a sedan cannot cover an
 * SUV request. Keep the rule here so quoting, dispatch and driver acceptance
 * all make the same decision. */
export function vehicleClassCovers(
  vehicleClass: string | null,
  requestedClass: string,
): boolean {
  return vehicleClass === requestedClass || (
    vehicleClass === "suv" && requestedClass === "business"
  );
}

export function vehicleFits(
  vehicle: {
    vehicleClass: string | null;
    passengerCapacity: number | null;
    luggageCapacity: number | null;
  },
  booking: { vehicleClass: string; passengers: number; luggageCount: number },
) {
  return (
    vehicleClassCovers(vehicle.vehicleClass, booking.vehicleClass) &&
    (vehicle.passengerCapacity ?? 0) >= booking.passengers &&
    (vehicle.luggageCapacity ?? 0) >= booking.luggageCount
  );
}
