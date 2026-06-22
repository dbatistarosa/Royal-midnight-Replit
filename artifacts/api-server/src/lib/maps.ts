/**
 * Mapbox route estimate helper.
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

/** Forward-geocode an address to Mapbox [lng, lat] coordinates. */
async function geocode(address: string, token: string): Promise<[number, number] | null> {
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");
  url.searchParams.set("country", "US");
  const res = await fetch(url.toString());
  const data = await res.json() as { features?: Array<{ center: [number, number] }> };
  return data.features?.[0]?.center ?? null;
}

/**
 * Call the Mapbox Directions API to get the estimated driving time and
 * distance between two addresses. Returns null if the access token is absent
 * or the request fails — callers should use DEFAULT_DURATION_MINUTES as fallback.
 */
export async function getRouteEstimate(
  pickup: string,
  dropoff: string,
): Promise<RouteEstimate | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return null;

  const origin = resolveAddress(pickup);
  const destination = resolveAddress(dropoff);

  try {
    const [originCoord, destCoord] = await Promise.all([geocode(origin, token), geocode(destination, token)]);
    if (!originCoord || !destCoord) return null;

    const url = new URL(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${originCoord[0]},${originCoord[1]};${destCoord[0]},${destCoord[1]}`,
    );
    url.searchParams.set("access_token", token);
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("overview", "false");

    const response = await fetch(url.toString());
    const data = await response.json() as {
      code: string;
      routes?: Array<{ distance: number; duration: number }>;
    };

    if (data.code !== "Ok" || !data.routes?.length) return null;

    const route = data.routes[0]!;
    const durationMinutes = Math.max(MIN_DURATION_MINUTES, Math.round(route.duration / 60));
    const distanceMiles = Math.round((route.distance / 1609.344) * 100) / 100;

    return { durationMinutes, distanceMiles };
  } catch {
    return null;
  }
}

export { DEFAULT_DURATION_MINUTES };
