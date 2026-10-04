import type { DriverBooking, DriverVehicle } from "@/api/types";

type BookingSummary = Pick<DriverBooking, "charterMode" | "flightNumber" | "vehicleClass" | "passengers" | "luggageCount">;

export function serviceLabel(booking: Pick<DriverBooking, "charterMode" | "flightNumber">): string {
  if (booking.charterMode === "hourly") return "Hourly Charter";
  if (booking.flightNumber) return "Airport Transfer";
  return "Chauffeur Transfer";
}

export function filterCompatibleVehicles<T extends Pick<DriverVehicle, "id" | "vehicleClass" | "passengerCapacity" | "luggageCapacity">>(
  vehicles: T[],
  booking: Pick<BookingSummary, "vehicleClass" | "passengers" | "luggageCount">,
): T[] {
  const requiredClass = booking.vehicleClass?.trim().toLowerCase();
  return vehicles.filter((vehicle) => {
    const vehicleClass = vehicle.vehicleClass?.trim().toLowerCase();
    const classMatches = !requiredClass || !vehicleClass || vehicleClass === requiredClass;
    const passengerCapacity = vehicle.passengerCapacity ?? Number.POSITIVE_INFINITY;
    const luggageCapacity = vehicle.luggageCapacity ?? Number.POSITIVE_INFINITY;
    return classMatches && passengerCapacity >= booking.passengers && luggageCapacity >= booking.luggageCount;
  });
}

export function isHourlyBooking(booking: Pick<DriverBooking, "charterMode">): boolean {
  return booking.charterMode === "hourly";
}
