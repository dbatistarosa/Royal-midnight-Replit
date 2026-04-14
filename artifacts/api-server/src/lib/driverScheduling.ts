/**
 * Driver scheduling availability utility.
 *
 * Implements three hard rules that must ALL pass before a driver may accept
 * or be shown a booking:
 *
 *  Rule 1 — No exact overlap
 *    The new pickup time cannot be identical to any existing confirmed trip.
 *
 *  Rule 2 — 60-minute pre-ride block
 *    The new pickup time cannot fall within 60 minutes before an existing
 *    trip's pickup time.  (Guarantees the driver can be 15 min early for
 *    the existing trip they already have.)
 *
 *  Rule 3 — Back-to-back buffer (both directions)
 *    When an existing trip ends before the new trip starts, the formula is:
 *      existingTripEnd + transitTime(existingDropoff → newPickup) + 15 min ≤ newPickupAt
 *    When the new trip ends before an existing trip starts, the formula is:
 *      newTripEnd + transitTime(newDropoff → existingPickup) + 15 min ≤ existingPickupAt
 *    Transit time is fetched from the Google Maps Distance Matrix API
 *    (GOOGLE_MAPS_API_KEY env var); falls back to DEFAULT_TRANSIT_MINUTES if unavailable.
 */

import { and, eq, gte, ne, or } from "drizzle-orm";
import { db, bookingsTable } from "@workspace/db";
import { DEFAULT_DURATION_MINUTES } from "./maps.js";

const ACTIVE_STATUSES = ["confirmed", "in_progress", "on_way", "on_location"] as const;

const RULE2_BUFFER_MS = 60 * 60 * 1000;        // 60 minutes
const EARLY_ARRIVAL_BUFFER_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_TRANSIT_MINUTES = 30;

/**
 * Uses the Google Maps Distance Matrix API to get the driving time in minutes
 * between two addresses.  Falls back to DEFAULT_TRANSIT_MINUTES when the API
 * key is absent or the request fails.
 *
 * Called exclusively for Rule 3 (back-to-back sequencing) to avoid unnecessary
 * API charges for Rules 1 and 2, which are pure arithmetic.
 */
async function getTransitMinutes(origin: string, destination: string): Promise<number> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return DEFAULT_TRANSIT_MINUTES;

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
    url.searchParams.set("origins", origin);
    url.searchParams.set("destinations", destination);
    url.searchParams.set("mode", "driving");
    url.searchParams.set("units", "imperial");
    url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString());
    const data = await response.json() as {
      status: string;
      rows?: Array<{
        elements: Array<{
          status: string;
          duration: { value: number };
        }>;
      }>;
    };

    if (data.status !== "OK" || !data.rows?.length) return DEFAULT_TRANSIT_MINUTES;
    const element = data.rows[0]?.elements[0];
    if (!element || element.status !== "OK") return DEFAULT_TRANSIT_MINUTES;

    return Math.max(1, Math.round(element.duration.value / 60));
  } catch {
    return DEFAULT_TRANSIT_MINUTES;
  }
}

/**
 * Returns true when the driver is available to take the new booking, false
 * when any of the three scheduling rules would be violated.
 *
 * Only considers same-day and future active trips to avoid spurious conflicts
 * from old historical records and to keep Distance Matrix API calls minimal.
 *
 * @param driverId     - Internal driver row ID (driversTable.id)
 * @param newBookingId - The booking the driver wants to accept
 */
export async function checkDriverAvailability(
  driverId: number,
  newBookingId: number,
): Promise<boolean> {
  const [newBooking] = await db
    .select({
      id: bookingsTable.id,
      pickupAt: bookingsTable.pickupAt,
      pickupAddress: bookingsTable.pickupAddress,
      dropoffAddress: bookingsTable.dropoffAddress,
      estimatedDurationMinutes: bookingsTable.estimatedDurationMinutes,
    })
    .from(bookingsTable)
    .where(eq(bookingsTable.id, newBookingId))
    .limit(1);

  if (!newBooking) return false;

  // Constrain to same-day and upcoming trips only — start of the new booking's
  // calendar day in UTC.  Trips earlier than this cannot conflict with the new
  // booking and would inflate Maps API call counts unnecessarily.
  const newPickupDate = newBooking.pickupAt;
  const startOfDay = new Date(
    Date.UTC(
      newPickupDate.getUTCFullYear(),
      newPickupDate.getUTCMonth(),
      newPickupDate.getUTCDate(),
      0, 0, 0, 0,
    ),
  );

  const existingTrips = await db
    .select({
      id: bookingsTable.id,
      pickupAt: bookingsTable.pickupAt,
      pickupAddress: bookingsTable.pickupAddress,
      dropoffAddress: bookingsTable.dropoffAddress,
      estimatedDurationMinutes: bookingsTable.estimatedDurationMinutes,
    })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.driverId, driverId),
        ne(bookingsTable.id, newBookingId),
        gte(bookingsTable.pickupAt, startOfDay),
        or(...ACTIVE_STATUSES.map(s => eq(bookingsTable.status, s))),
      ),
    );

  if (existingTrips.length === 0) return true;

  const newPickup = newBooking.pickupAt.getTime();
  const newDurationMs = (newBooking.estimatedDurationMinutes ?? DEFAULT_DURATION_MINUTES) * 60_000;
  const newEnd = newPickup + newDurationMs;

  for (const trip of existingTrips) {
    const existingPickup = trip.pickupAt.getTime();
    const existingDurationMs = (trip.estimatedDurationMinutes ?? DEFAULT_DURATION_MINUTES) * 60_000;
    const existingEnd = existingPickup + existingDurationMs;

    // ── Rule 1: no exact pickup-time overlap ─────────────────────────────────
    if (newPickup === existingPickup) {
      return false;
    }

    // ── Rule 2: new ride pickup within 60 min before an existing ride ─────────
    // Range: [existingPickup − 60 min, existingPickup)
    if (newPickup < existingPickup && newPickup >= existingPickup - RULE2_BUFFER_MS) {
      return false;
    }

    // ── Rule 3a: existing trip is first, new trip comes after ─────────────────
    // Formula: existingEnd + transitTime(existingDropoff → newPickup) + 15 min ≤ newPickup
    if (existingPickup < newPickup) {
      const transitMinutes = await getTransitMinutes(trip.dropoffAddress, newBooking.pickupAddress);
      const transitMs = transitMinutes * 60_000;
      if (existingEnd + transitMs + EARLY_ARRIVAL_BUFFER_MS > newPickup) {
        return false;
      }
    }

    // ── Rule 3b: new trip is first, existing trip comes after ─────────────────
    // Only checked when newPickup is already outside the Rule 2 window.
    // Formula: newEnd + transitTime(newDropoff → existingPickup) + 15 min ≤ existingPickup
    if (newPickup < existingPickup - RULE2_BUFFER_MS) {
      const transitMinutes = await getTransitMinutes(newBooking.dropoffAddress, trip.pickupAddress);
      const transitMs = transitMinutes * 60_000;
      if (newEnd + transitMs + EARLY_ARRIVAL_BUFFER_MS > existingPickup) {
        return false;
      }
    }
  }

  return true;
}
