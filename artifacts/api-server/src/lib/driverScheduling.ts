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
 *    the trip they already have.)
 *
 *  Rule 3 — Back-to-back buffer (both directions)
 *    When an existing trip ends before the new trip starts, the formula is:
 *      existingTripEnd + transit(existingDropoff → newPickup) + 15 min ≤ newPickupAt
 *    When the new trip ends before an existing trip starts, the formula is:
 *      newTripEnd + transit(newDropoff → existingPickup) + 15 min ≤ existingPickupAt
 *    Transit time is fetched from the Google Maps Directions API; if the API
 *    is unavailable we fall back to DEFAULT_TRANSIT_MINUTES.
 */

import { and, eq, ne, or } from "drizzle-orm";
import { db, bookingsTable } from "@workspace/db";
import { DEFAULT_DURATION_MINUTES } from "./maps.js";

const ACTIVE_STATUSES = ["confirmed", "in_progress", "on_way", "on_location"] as const;

const RULE2_BUFFER_MS = 60 * 60 * 1000;
const EARLY_ARRIVAL_BUFFER_MS = 15 * 60 * 1000;
const DEFAULT_TRANSIT_MINUTES = 30;

type TripWindow = {
  id: number;
  pickupAt: Date;
  dropoffAddress: string;
  pickupAddress: string;
  durationMs: number;
};

async function getTransitMinutes(origin: string, destination: string): Promise<number> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return DEFAULT_TRANSIT_MINUTES;

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", origin);
    url.searchParams.set("destination", destination);
    url.searchParams.set("mode", "driving");
    url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString());
    const data = await response.json() as {
      status: string;
      routes?: Array<{ legs: Array<{ duration: { value: number } }> }>;
    };

    if (data.status !== "OK" || !data.routes?.length) return DEFAULT_TRANSIT_MINUTES;
    const leg = data.routes[0]?.legs[0];
    if (!leg) return DEFAULT_TRANSIT_MINUTES;

    return Math.max(1, Math.round(leg.duration.value / 60));
  } catch {
    return DEFAULT_TRANSIT_MINUTES;
  }
}

/**
 * Returns true when the driver is available to take the new booking, false
 * when any of the three scheduling rules would be violated.
 *
 * @param driverId   - Internal driver row ID (driversTable.id)
 * @param newBookingId - The booking the driver is trying to accept
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

    // ── Rule 1: no exact overlap ─────────────────────────────────────────────
    if (newPickup === existingPickup) {
      return false;
    }

    // ── Rule 2: new ride is within 60 min before an existing ride ────────────
    // i.e. existingPickup - 60min ≤ newPickup < existingPickup
    if (newPickup < existingPickup && newPickup >= existingPickup - RULE2_BUFFER_MS) {
      return false;
    }

    // ── Rule 3a: existing trip ends before new trip starts ───────────────────
    // Formula: existingEnd + transitMinutes + 15min ≤ newPickup
    if (existingPickup < newPickup) {
      const transitMinutes = await getTransitMinutes(trip.dropoffAddress, newBooking.pickupAddress);
      const transitMs = transitMinutes * 60_000;
      if (existingEnd + transitMs + EARLY_ARRIVAL_BUFFER_MS > newPickup) {
        return false;
      }
    }

    // ── Rule 3b: new trip ends before an existing trip starts ────────────────
    // (applies when newPickup is more than 60 min before existingPickup —
    //  the Rule 2 window is already caught above)
    // Formula: newEnd + transitMinutes + 15min ≤ existingPickup
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
