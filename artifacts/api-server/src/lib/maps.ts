/**
 * Google Maps route estimate helper.
 * Used by the booking system to store estimated drive time so that
 * the driver scheduling conflict detector can prevent impossible back-to-back trips.
 */

const AIRPORT_ADDRESSES: Record<string, string> = {
  FLL: "Fort Lauderdale-Hollywood International Airport, 100 Terminal Dr, Fort Lauderdale, FL 33315",
  MIA: "Miami International Airport, 2100 NW 42nd Ave, Miami, FL 33142",
  PBI: "Palm Beach International Airport, 1000 James L Turnage Blvd, West Palm Beach, FL 33406",
};

/** Resolve shorthand airport codes and "FLL - ..." prefixes to full addresses. */
function resolveAddress(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (AIRPORT_ADDRESSES[upper]) return AIRPORT_ADDRESSES[upper];
  for (const code of Object.keys(AIRPORT_ADDRESSES)) {
    if (upper.startsWith(code + " -") || upper.startsWith(code + "-")) {
      return AIRPORT_ADDRESSES[code];
    }
  }
  return raw.trim();
}

export type RouteEstimate = {
  durationMinutes: number;
  distanceMiles: number;
};

const MIN_DURATION_MINUTES = 15;  // never assume a trip takes less than this
const DEFAULT_DURATION_MINUTES = 60; // fallback when API is unavailable

/**
 * Call the Google Maps Directions API to get the estimated driving time and
 * distance between two addresses. Returns null if the API key is absent or
 * the request fails — callers should use DEFAULT_DURATION_MINUTES as fallback.
 */
export async function getRouteEstimate(
  pickup: string,
  dropoff: string,
): Promise<RouteEstimate | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const origin = resolveAddress(pickup);
  const destination = resolveAddress(dropoff);

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", origin);
    url.searchParams.set("destination", destination);
    url.searchParams.set("mode", "driving");
    url.searchParams.set("units", "imperial");
    url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString());
    const data = await response.json() as {
      status: string;
      routes?: Array<{
        legs: Array<{
          distance: { value: number };
          duration: { value: number };
        }>;
      }>;
    };

    if (data.status !== "OK" || !data.routes?.length) return null;

    const leg = data.routes[0]?.legs[0];
    if (!leg) return null;

    const durationMinutes = Math.max(
      MIN_DURATION_MINUTES,
      Math.round(leg.duration.value / 60),
    );
    const distanceMiles = Math.round((leg.distance.value / 1609.344) * 100) / 100;

    return { durationMinutes, distanceMiles };
  } catch {
    return null;
  }
}

export { DEFAULT_DURATION_MINUTES };
