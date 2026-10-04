export type RideTab = "upcoming" | "completed" | "cancelled";
type Ride = { status: string; pickupAddress: string; dropoffAddress: string; pickupAt: string };
const UPCOMING = new Set(["confirmed", "on_way", "on_location", "in_progress"]);
export function filterRides<T extends Ride>(rides: T[], tab: RideTab, search: string): T[] {
  const query = search.trim().toLowerCase();
  return rides.filter(ride => (tab === "upcoming" ? UPCOMING.has(ride.status) : ride.status === tab)
    && `${ride.pickupAddress} ${ride.dropoffAddress}`.toLowerCase().includes(query))
    .sort((a, b) => tab === "upcoming" ? Date.parse(a.pickupAt) - Date.parse(b.pickupAt) : Date.parse(b.pickupAt) - Date.parse(a.pickupAt));
}
export function notificationCategory(notice: { type: string; bookingId: number | null }): "bookings" | "documents" | "system" {
  if (notice.bookingId != null) return "bookings";
  if (/document|insurance|license|compliance|vehicle_registration/i.test(notice.type)) return "documents";
  return "system";
}

export function driverInitials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "RM";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

export function vehicleClassLabel(value: string | null | undefined): string {
  if (!value) return "Vehicle details";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function driverPayoutTotal(driverEarnings: number, tipAmount: number | null | undefined): number {
  return Math.round((driverEarnings + (tipAmount ?? 0)) * 100) / 100;
}
