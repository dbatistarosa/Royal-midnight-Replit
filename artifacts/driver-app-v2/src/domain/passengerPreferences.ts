import type { PassengerPreferences } from "@/api/types";

export function formatPassengerPreferenceRows(preferences: PassengerPreferences | null | undefined): string[] {
  if (!preferences) return [];
  return [
    preferences.addressTitle ? `Address as: ${preferences.addressTitle}` : null,
    preferences.cabinTempF != null ? `Cabin temp: ${preferences.cabinTempF}°F` : null,
    preferences.musicPreference ? `Music: ${preferences.musicPreference}` : null,
    preferences.quietRide ? "Quiet ride: Prefers minimal conversation" : null,
    preferences.preferredBeverage ? `Beverage: ${preferences.preferredBeverage}` : null,
    preferences.opensOwnDoor != null
      ? (preferences.opensOwnDoor ? "Door service: Passenger opens own door" : "Door service: Driver opens door")
      : null,
    preferences.vipNotes ? `VIP note: ${preferences.vipNotes}` : null,
  ].filter((row): row is string => Boolean(row));
}
