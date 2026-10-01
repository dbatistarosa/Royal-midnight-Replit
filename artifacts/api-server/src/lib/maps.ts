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

export type RouteMapImage = {
  dataUri: string;
  width: 800;
  height: 400;
};

export type RouteMapFailure =
  | "mapbox_not_configured"
  | "invalid_route"
  | "geocode_failed"
  | "directions_failed"
  | "static_image_failed"
  | "invalid_image"
  | "provider_error";

export type RouteMapResult = {
  image: RouteMapImage | null;
  reason?: RouteMapFailure;
};

const MIN_DURATION_MINUTES = 15;  // never assume a trip takes less than this
const DEFAULT_DURATION_MINUTES = 60; // fallback when API is unavailable
const MAP_REQUEST_TIMEOUT_MS = 8_000;

async function mapFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAP_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Forward-geocode an address to Mapbox [lng, lat] coordinates. */
async function geocode(address: string, token: string): Promise<[number, number] | null> {
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");
  url.searchParams.set("country", "US");
  const res = await mapFetch(url.toString());
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

    const response = await mapFetch(url.toString());
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

/** Keep the route order identical across the web and native driver views. */
export function orderedRouteAddresses(pickup: string, stops: string[], dropoff: string): string[] {
  return [pickup, ...stops, dropoff]
    .map((address) => address.trim())
    .filter(Boolean)
    .slice(0, 25);
}

/**
 * Draw a private, server-proxied route image for an authorized driver view.
 * The provider token never leaves this process: the mobile client receives
 * only the image bytes as a data URI.
 */
export async function getRouteMapImageResult(
  pickup: string,
  stops: string[],
  dropoff: string,
): Promise<RouteMapResult> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return { image: null, reason: "mapbox_not_configured" };
  const addresses = orderedRouteAddresses(pickup, stops, dropoff);
  if (addresses.length < 2) return { image: null, reason: "invalid_route" };

  try {
    const coordinates = await Promise.all(addresses.map((address) => geocode(resolveAddress(address), token)));
    if (coordinates.some((point): point is null => point === null)) return { image: null, reason: "geocode_failed" };
    const points = coordinates as [number, number][];
    const directionsUrl = new URL(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${points.map(([lng, lat]) => `${lng},${lat}`).join(";")}`,
    );
    directionsUrl.searchParams.set("access_token", token);
    directionsUrl.searchParams.set("geometries", "geojson");
    directionsUrl.searchParams.set("overview", "full");
    const directionsResponse = await mapFetch(directionsUrl);
    if (!directionsResponse.ok) return { image: null, reason: "directions_failed" };
    const directions = await directionsResponse.json() as {
      routes?: Array<{ geometry?: { type: "LineString"; coordinates: [number, number][] } }>;
    };
    const geometry = directions.routes?.[0]?.geometry;
    if (!geometry?.coordinates?.length) return { image: null, reason: "directions_failed" };

    const feature = {
      type: "Feature",
      properties: {},
      geometry,
    };
    const staticUrl = new URL(
      `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/geojson(${encodeURIComponent(JSON.stringify(feature))})/auto/800x400@2x`,
    );
    staticUrl.searchParams.set("access_token", token);
    staticUrl.searchParams.set("padding", "50");
    const imageResponse = await mapFetch(staticUrl);
    if (!imageResponse.ok) return { image: null, reason: "static_image_failed" };
    const contentType = imageResponse.headers.get("content-type") ?? "image/png";
    if (!contentType.startsWith("image/")) return { image: null, reason: "invalid_image" };
    const base64 = Buffer.from(await imageResponse.arrayBuffer()).toString("base64");
    return { image: { dataUri: `data:${contentType};base64,${base64}`, width: 800, height: 400 } };
  } catch {
    return { image: null, reason: "provider_error" };
  }
}

export async function getRouteMapImage(
  pickup: string,
  stops: string[],
  dropoff: string,
): Promise<RouteMapImage | null> {
  return (await getRouteMapImageResult(pickup, stops, dropoff)).image;
}

export { DEFAULT_DURATION_MINUTES };
