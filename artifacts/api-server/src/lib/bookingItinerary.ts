export type ItineraryRowLike = {
  sequence: number;
  kind: "stop" | "final" | string;
  address: string | null | undefined;
};

export type BookingRoutePoint = {
  kind: "pickup" | "stop" | "final";
  label: string;
  address: string;
};

type BookingRouteInput = {
  pickupAddress: string | null | undefined;
  dropoffAddress: string | null | undefined;
};

export type BookingItineraryInsert = {
  bookingId: number;
  sequence: number;
  kind: "stop" | "final";
  address: string;
};

const cleanAddress = (address: string | null | undefined) => address?.trim() ?? "";

const sameAddress = (left: string, right: string) =>
  left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;

export function parseLegacyWaypoints(stored: string | null | undefined): string[] {
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string").map(cleanAddress).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function buildItineraryRows(
  bookingId: number,
  waypoints: readonly string[],
  dropoffAddress: string,
): BookingItineraryInsert[] {
  const stops = waypoints
    .map(cleanAddress)
    .filter(Boolean)
    .map((address, sequence) => ({ bookingId, sequence, kind: "stop" as const, address }));
  const dropoff = cleanAddress(dropoffAddress);
  return dropoff
    ? [...stops, { bookingId, sequence: stops.length, kind: "final" as const, address: dropoff }]
    : stops;
}

export function itineraryNeedsSync(
  existing: readonly ItineraryRowLike[],
  expected: readonly ItineraryRowLike[],
): boolean {
  if (existing.length !== expected.length) return true;
  const ordered = [...existing].sort((left, right) => left.sequence - right.sequence);
  return expected.some((row, index) => {
    const current = ordered[index];
    return !current
      || current.sequence !== row.sequence
      || current.kind !== row.kind
      || cleanAddress(current.address) !== cleanAddress(row.address);
  });
}

/**
 * Builds the canonical booking route used by invoices, admin details, and
 * driver-facing itinerary views. Legacy bookings without itinerary rows keep
 * the original pickup/drop-off pair.
 */
export function formatBookingRoute(
  booking: BookingRouteInput,
  itinerary: readonly ItineraryRowLike[],
): BookingRoutePoint[] {
  const pickup = cleanAddress(booking.pickupAddress);
  const fallbackDropoff = cleanAddress(booking.dropoffAddress);
  const rows = [...itinerary]
    .sort((left, right) => left.sequence - right.sequence)
    .map((row) => ({ ...row, address: cleanAddress(row.address) }))
    .filter((row) => row.address.length > 0);

  const finalRow = [...rows].reverse().find((row) => row.kind === "final");
  const dropoff = finalRow?.address || fallbackDropoff;
  const points: BookingRoutePoint[] = [];

  if (pickup) {
    points.push({ kind: "pickup", label: "Pickup", address: pickup });
  }

  let stopNumber = 0;
  for (const row of rows) {
    if (row.kind !== "stop" || sameAddress(row.address, dropoff)) continue;
    stopNumber += 1;
    points.push({ kind: "stop", label: `Stop ${stopNumber}`, address: row.address });
  }

  if (dropoff && !points.some((point) => point.kind === "final" && sameAddress(point.address, dropoff))) {
    points.push({ kind: "final", label: "Final destination", address: dropoff });
  }

  return points;
}
