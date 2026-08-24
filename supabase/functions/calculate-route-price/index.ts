import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Same per-vehicle-class defaults used by the authoritative /quote Express
// route (artifacts/api-server/src/routes/quote.ts) — kept in sync manually,
// this function only produces a live preview while the user drags map pins;
// the final price at booking time is always computed server-side via /quote.
const DEFAULT_RATE_PER_MILE: Record<string, number> = { business: 3.5, suv: 4.0 };
const DEFAULT_HOURLY_RATE: Record<string, number> = { business: 95, suv: 125 };
const DEFAULT_EXTRA_MILE_RATE: Record<string, number> = { business: 3.5, suv: 4.0 };
const DEFAULT_MAX_MILES_PER_HOUR = 30;

type ServiceType = "hourly" | "per_mile";

interface CalculateRoutePriceRequest {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  service_type: ServiceType;
  vehicle_class?: "business" | "suv";
  rate_per_mile?: number;
  hourly_rate?: number;
  max_miles_per_hour?: number;
  max_miles?: number;
  extra_mile_rate?: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isValidCoord(lat: unknown, lng: unknown): boolean {
  return typeof lat === "number" && typeof lng === "number" &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = Deno.env.get("MAPBOX_ACCESS_TOKEN");
  if (!token) {
    return new Response(JSON.stringify({ success: false, error: "MAPBOX_ACCESS_TOKEN not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: CalculateRoutePriceRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, service_type, vehicle_class } = body;
  if (
    !isValidCoord(pickup_lat, pickup_lng) ||
    !isValidCoord(dropoff_lat, dropoff_lng) ||
    (service_type !== "hourly" && service_type !== "per_mile")
  ) {
    return new Response(
      JSON.stringify({ success: false, error: "pickup_lat/lng, dropoff_lat/lng, and service_type ('hourly'|'per_mile') are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${pickup_lng},${pickup_lat};${dropoff_lng},${dropoff_lat}`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "false");

  const mapboxRes = await fetch(url.toString());
  const mapboxData = await mapboxRes.json().catch(() => null) as {
    code: string;
    routes?: Array<{ distance: number; duration: number }>;
  } | null;

  if (!mapboxRes.ok || mapboxData?.code !== "Ok" || !mapboxData.routes?.length) {
    console.error("[calculate-route-price] Mapbox Directions error:", mapboxRes.status, JSON.stringify(mapboxData));
    return new Response(JSON.stringify({ success: false, error: "Could not calculate route" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const route = mapboxData.routes[0]!;
  const distanceMiles = round2(route.distance / 1609.344);
  const durationMinutes = Math.round(route.duration / 60);

  let estimatedPrice: number;
  const breakdown: Record<string, number> = {};

  if (service_type === "hourly") {
    const maxMilesPerHour = body.max_miles_per_hour ?? DEFAULT_MAX_MILES_PER_HOUR;
    const hourlyRate = body.hourly_rate ?? DEFAULT_HOURLY_RATE[vehicle_class ?? "business"] ?? 95;
    const estimatedHours = distanceMiles / maxMilesPerHour;
    estimatedPrice = estimatedHours * hourlyRate;

    breakdown.estimatedHours = round2(estimatedHours);
    breakdown.hourlyRate = hourlyRate;
    breakdown.maxMilesPerHour = maxMilesPerHour;
    breakdown.basePrice = round2(estimatedPrice);

    if (body.max_miles != null && distanceMiles > body.max_miles) {
      const extraMiles = distanceMiles - body.max_miles;
      const extraMileRate = body.extra_mile_rate ?? DEFAULT_EXTRA_MILE_RATE[vehicle_class ?? "business"] ?? 3.5;
      const extraCharge = extraMiles * extraMileRate;
      estimatedPrice += extraCharge;

      breakdown.maxMiles = body.max_miles;
      breakdown.extraMiles = round2(extraMiles);
      breakdown.extraMileRate = extraMileRate;
      breakdown.extraCharge = round2(extraCharge);
    }
  } else {
    const ratePerMile = body.rate_per_mile ?? DEFAULT_RATE_PER_MILE[vehicle_class ?? "business"] ?? 3.5;
    estimatedPrice = distanceMiles * ratePerMile;

    breakdown.ratePerMile = ratePerMile;
    breakdown.distanceMiles = distanceMiles;
  }

  return new Response(
    JSON.stringify({
      distance_miles: distanceMiles,
      duration_minutes: durationMinutes,
      estimated_price: round2(estimatedPrice),
      breakdown,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
