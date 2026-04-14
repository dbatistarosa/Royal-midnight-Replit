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
 *  Rule 3 — Back-to-back buffer (existing trip → new trip)
 *    When an existing trip ends before the new trip starts, the formula is:
 *      existingTripEnd + transitTime(existingDropoff → newPickup) + 15 min ≤ newPickupAt
 *    Transit time is fetched from the Google Maps Distance Matrix API
 *    (GOOGLE_MAPS_API_KEY env var).
 *
 *    FAIL-CLOSED: if GOOGLE_MAPS_API_KEY is absent or the Maps request fails,
 *    the driver is treated as unavailable for Rule 3 cases.  This ensures
 *    the strict scheduling guarantee is never silently degraded to an
 *    approximation.
 */

import { and, eq, gte, lt, ne, or } from "drizzle-orm";
import { db, bookingsTable } from "@workspace/db";
import { DEFAULT_DURATION_MINUTES } from "./maps.js";

const ACTIVE_STATUSES = ["confirmed", "in_progress", "on_way", "on_location"] as const;

const RULE2_BUFFER_MS = 60 * 60 * 1000;        // 60 minutes
const EARLY_ARRIVAL_BUFFER_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Calls the Google Maps Distance Matrix API for the driving duration between
 * two addresses.  Returns the duration in minutes, or null when the API key
 * is absent or the request fails.
 *
 * Callers MUST treat null as a conflict (fail-closed) — never fall back to an
 * approximate value.
 */
export async function getTransitMinutes(
  origin: string,
  destination: string,
): Promise<number | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

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

    if (data.status !== "OK" || !data.rows?.length) return null;
    const element = data.rows[0]?.elements[0];
    if (!element || element.status !== "OK") return null;

    return Math.max(1, Math.round(element.duration.value / 60));
  } catch {
    return null;
  }
}

/**
 * Returns true when the driver is available to take the new booking, false
 * when any of the three scheduling rules would be violated.
 *
 * Only considers active trips on the same calendar day (UTC) as the new booking
 * to limit Distance Matrix API calls and match the spec requirement of
 * "upcoming confirmed/active bookings for the same date".
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

  // Constrain query to same calendar day (UTC).
  const d = newBooking.pickupAt;
  const startOfDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
  const endOfDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999),
  );

  const existingTrips = await db
    .select({
      id: bookingsTable.id,
      pickupAt: bookingsTable.pickupAt,
      dropoffAddress: bookingsTable.dropoffAddress,
      estimatedDurationMinutes: bookingsTable.estimatedDurationMinutes,
    })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.driverId, driverId),
        ne(bookingsTable.id, newBookingId),
        gte(bookingsTable.pickupAt, startOfDay),
        lt(bookingsTable.pickupAt, endOfDay),
        or(...ACTIVE_STATUSES.map(s => eq(bookingsTable.status, s))),
      ),
    );

  if (existingTrips.length === 0) return true;

  const newPickup = newBooking.pickupAt.getTime();

  for (const trip of existingTrips) {
    const existingPickup = trip.pickupAt.getTime();
    const existingDurationMs = (trip.estimatedDurationMinutes ?? DEFAULT_DURATION_MINUTES) * 60_000;
    const existingEnd = existingPickup + existingDurationMs;

    // ── Rule 1: no exact pickup-time overlap ─────────────────────────────────
    if (newPickup === existingPickup) {
      return false;
    }

    // ── Rule 2: new ride pickup within 60 min before an existing ride ─────────
    // Conflict range: [existingPickup − 60 min, existingPickup)
    if (newPickup < existingPickup && newPickup >= existingPickup - RULE2_BUFFER_MS) {
      return false;
    }

    // ── Rule 3: existing trip ends before new trip starts ────────────────────
    // Formula: existingEnd + transitTime(existingDropoff → newPickup) + 15 min ≤ newPickup
    // FAIL-CLOSED: null transit time (Maps unavailable) → treat as conflict.
    if (existingPickup < newPickup) {
      const transitMinutes = await getTransitMinutes(trip.dropoffAddress, newBooking.pickupAddress);
      if (transitMinutes === null) {
        return false;
      }
      const transitMs = transitMinutes * 60_000;
      if (existingEnd + transitMs + EARLY_ARRIVAL_BUFFER_MS > newPickup) {
        return false;
      }
    }
  }

  return true;
}
