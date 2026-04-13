import { Router, type IRouter } from "express";
import { db, settingsTable, pricingRulesTable, geoZonesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { GetQuoteBody, GetQuoteResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const DEFAULT_BASE_FARES: Record<string, number> = {
  business: 55,
  suv: 75,
};

const DEFAULT_RATE_PER_MILE: Record<string, number> = {
  business: 3.5,
  suv: 4.0,
};

// Canonical airport addresses for resolving shortcodes passed from the frontend
const AIRPORT_ADDRESSES: Record<string, string> = {
  FLL: "Fort Lauderdale-Hollywood International Airport, 100 Terminal Dr, Fort Lauderdale, FL 33315",
  MIA: "Miami International Airport, 2100 NW 42nd Ave, Miami, FL 33142",
  PBI: "Palm Beach International Airport, 1000 James L Turnage Blvd, West Palm Beach, FL 33406",
  MCO: "Orlando International Airport, One Jeff Fuqua Blvd, Orlando, FL 32827",
  TPA: "Tampa International Airport, 4100 George J Bean Pkwy, Tampa, FL 33607",
  JAX: "Jacksonville International Airport, 2400 Yankee Clipper Dr, Jacksonville, FL 32218",
  RSW: "Southwest Florida International Airport, 11000 Terminal Access Rd, Fort Myers, FL 33913",
  SRQ: "Sarasota Bradenton International Airport, 6000 Airport Cir, Sarasota, FL 34243",
  PIE: "St. Pete-Clearwater International Airport, 14700 Terminal Blvd, Clearwater, FL 33762",
  GNV: "Gainesville Regional Airport, 3880 NE 39th Ave, Gainesville, FL 32609",
  TLH: "Tallahassee International Airport, 3300 Capital Circle SW, Tallahassee, FL 32310",
  EYW: "Key West International Airport, 3491 S Roosevelt Blvd, Key West, FL 33040",
  DAB: "Daytona Beach International Airport, 700 Catalina Dr, Daytona Beach, FL 32114",
  MLB: "Melbourne Orlando International Airport, 1 Air Terminal Pkwy, Melbourne, FL 32901",
  VPS: "Destin–Fort Walton Beach Airport, 1 Putt-Putt Place, Eglin AFB, FL 32542",
  ECP: "Northwest Florida Beaches International Airport, 6300 West Bay Pkwy, Panama City Beach, FL 32409",
  PNS: "Pensacola International Airport, 2430 Airport Blvd, Pensacola, FL 32504",
  OCF: "Ocala International Airport, 1770 SW 60th Ave, Ocala, FL 34474",
  SFB: "Orlando Sanford International Airport, 1200 Red Cleveland Blvd, Sanford, FL 32773",
};

// AIRPORT_KEYWORDS is used only to decide whether to add the airport surcharge
const AIRPORT_KEYWORDS = [
  "FLL", "MIA", "PBI", "MCO", "TPA", "JAX", "RSW", "SRQ", "PIE",
  "GNV", "TLH", "EYW", "DAB", "MLB", "VPS", "ECP", "PNS", "OCF", "SFB",
  "Fort Lauderdale-Hollywood", "Miami International", "Palm Beach International",
  "Orlando International", "Tampa International", "Jacksonville International",
  "Southwest Florida International", "Sarasota Bradenton", "St. Pete-Clearwater",
  "Key West International", "Daytona Beach International", "Melbourne Orlando",
  "Tallahassee International", "Gainesville Regional", "Pensacola International",
];

function isAirportTrip(address: string): boolean {
  return AIRPORT_KEYWORDS.some((k) => address.toLowerCase().includes(k.toLowerCase()));
}

/** Resolve an address entered by the user to a canonical geocodable string.
 *  Airport shortcuts selected from the dropdown look like "FLL - Fort Lauderdale-Hollywood International Airport"
 *  or the full Place description. We normalise both. */
function resolveAddress(raw: string): string {
  const upper = raw.trim().toUpperCase();
  // Direct code match (e.g. "FLL", "MIA", "PBI")
  if (AIRPORT_ADDRESSES[upper]) return AIRPORT_ADDRESSES[upper];
  // Shortcut format "FLL - Fort Lauderdale-Hollywood International Airport"
  for (const code of Object.keys(AIRPORT_ADDRESSES)) {
    if (upper.startsWith(code + " -") || upper.startsWith(code + "-")) {
      return AIRPORT_ADDRESSES[code];
    }
  }
  return raw.trim();
}

async function getDirectionsDistance(
  pickup: string,
  dropoff: string,
  waypoints?: string[],
): Promise<{ distance: number; duration: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const origin = resolveAddress(pickup);
  const destination = resolveAddress(dropoff);

  try {
    // Directions API — returns actual driving route distance & duration
    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", origin);
    url.searchParams.set("destination", destination);
    url.searchParams.set("mode", "driving");
    url.searchParams.set("units", "imperial");
    url.searchParams.set("key", apiKey);

    if (waypoints && waypoints.length > 0) {
      const resolved = waypoints.map(resolveAddress).join("|");
      url.searchParams.set("waypoints", resolved);
    }

    const response = await fetch(url.toString());
    const data = await response.json() as {
      status: string;
      routes?: Array<{
        legs: Array<{
          distance: { value: number; text: string };
          duration: { value: number; text: string };
        }>;
      }>;
    };

    if (data.status !== "OK" || !data.routes?.length) return null;

    // Sum all legs (multi-stop routes have multiple legs)
    const legs = data.routes[0].legs;
    if (!legs?.length) return null;

    const totalDistanceMeters = legs.reduce((sum, l) => sum + l.distance.value, 0);
    const totalDurationSeconds = legs.reduce((sum, l) => sum + l.duration.value, 0);

    return {
      distance: Math.round((totalDistanceMeters / 1609.344) * 10) / 10,
      duration: Math.round(totalDurationSeconds / 60),
    };
  } catch {
    return null;
  }
}

// Fallback distances (road miles) — only used if Google API is unavailable
function fallbackDistance(pickup: string, dropoff: string): { distance: number; duration: number } {
  const pu = pickup.toUpperCase();
  const do_ = dropoff.toUpperCase();
  const hasFLL = (s: string) => s.includes("FLL") || s.includes("FORT LAUDERDALE");
  const hasMIA = (s: string) => s.includes("MIA") || s.includes("MIAMI");
  const hasPBI = (s: string) => s.includes("PBI") || s.includes("PALM BEACH");

  if (hasFLL(pu) && hasMIA(do_)) return { distance: 35, duration: 45 };
  if (hasMIA(pu) && hasFLL(do_)) return { distance: 35, duration: 45 };
  if (hasPBI(pu) && hasFLL(do_)) return { distance: 56, duration: 65 };
  if (hasFLL(pu) && hasPBI(do_)) return { distance: 56, duration: 65 };
  if (hasPBI(pu) && hasMIA(do_)) return { distance: 80, duration: 90 };
  if (hasMIA(pu) && hasPBI(do_)) return { distance: 80, duration: 90 };

  // Generic South Florida point-to-point — rough estimate
  return { distance: 25, duration: 40 };
}

// ── Geo Zone helpers ──────────────────────────────────────────────────────────

/** Haversine distance in km between two lat/lng points */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Ray-casting point-in-polygon. coords: [[lng,lat],...] (GeoJSON order) */
function pointInPolygon(lat: number, lng: number, coords: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i]![0]!, yi = coords[i]![1]!;
    const xj = coords[j]![0]!, yj = coords[j]![1]!;
    const intersect = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Geocode an address to lat/lng via Google Geocoding API (best-effort) */
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("key", apiKey);
    const res = await fetch(url.toString());
    const data = await res.json() as { status: string; results?: Array<{ geometry: { location: { lat: number; lng: number } } }> };
    if (data.status !== "OK" || !data.results?.length) return null;
    const loc = data.results[0]!.geometry.location;
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

/** Find the highest rate multiplier among active zones that cover any of the given addresses */
async function getZoneMultiplier(addresses: string[]): Promise<number> {
  try {
    const zones = await db.select().from(geoZonesTable).where(eq(geoZonesTable.isActive, true));
    if (!zones.length) return 1.0;

    let maxMultiplier = 1.0;

    for (const address of addresses) {
      const point = await geocodeAddress(address);
      if (!point) continue;

      for (const zone of zones) {
        let inZone = false;
        try {
          const geom = JSON.parse(zone.geometry) as Record<string, unknown>;
          if (zone.type === "circle") {
            const center = geom["center"] as [number, number];
            const radiusKm = geom["radiusKm"] as number;
            inZone = haversineKm(point.lat, point.lng, center[0], center[1]) <= radiusKm;
          } else if (zone.type === "polygon") {
            const coords = geom["coordinates"] as number[][];
            inZone = pointInPolygon(point.lat, point.lng, coords);
          }
        } catch {
          // malformed geometry — skip
        }
        if (inZone && zone.rateMultiplier > maxMultiplier) {
          maxMultiplier = zone.rateMultiplier;
        }
      }
    }

    return maxMultiplier;
  } catch {
    return 1.0;
  }
}

async function getSetting(key: string, fallback: string): Promise<string> {
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

/** Fetch active pricing rule for a given vehicle class from the DB.
 *  Falls back to hardcoded defaults if none found. */
async function getPricingForClass(vc: string): Promise<{ baseFare: number; ratePerMile: number; airportFee: number }> {
  try {
    const [rule] = await db
      .select()
      .from(pricingRulesTable)
      .where(and(eq(pricingRulesTable.vehicleClass, vc), eq(pricingRulesTable.isActive, true)));

    if (rule) {
      return {
        baseFare: parseFloat(rule.baseFare ?? "0") || (DEFAULT_BASE_FARES[vc] ?? 35),
        ratePerMile: parseFloat(rule.ratePerMile ?? "0") || (DEFAULT_RATE_PER_MILE[vc] ?? 2.5),
        airportFee: parseFloat(rule.airportSurcharge ?? "0") || 0,
      };
    }
  } catch {
    // fall through to defaults
  }

  return {
    baseFare: DEFAULT_BASE_FARES[vc] ?? 35,
    ratePerMile: DEFAULT_RATE_PER_MILE[vc] ?? 2.5,
    airportFee: 0,
  };
}

// Hourly charter rates per vehicle class ($/hr, before tax)
const HOURLY_RATES: Record<string, number> = {
  business: 95,
  suv: 125,
};

router.post("/quote", async (req, res): Promise<void> => {
  const parsed = GetQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(parsed.error.errors);
    return;
  }

  const { pickupAddress, dropoffAddress, vehicleClass, passengers, pickupAt } = parsed.data;
  const vc = vehicleClass as string;

  // Multi-stop + charter extensions (not in generated Zod schema yet — read from raw body)
  const rawBody = req.body as Record<string, unknown>;
  const waypoints: string[] = Array.isArray(rawBody.waypoints)
    ? (rawBody.waypoints as string[]).filter(w => typeof w === "string" && w.trim())
    : [];
  const charterMode: string = typeof rawBody.charterMode === "string" ? rawBody.charterMode : "route";
  const charterHours: number = typeof rawBody.charterHours === "number" ? rawBody.charterHours : 0;

  // Validate minimum lead time
  const minHoursStr = await getSetting("min_booking_hours", "2");
  const minHours = parseFloat(minHoursStr);
  const pickupDate = new Date(pickupAt);
  const leadTimeHours = (pickupDate.getTime() - Date.now()) / (1000 * 60 * 60);
  if (leadTimeHours < minHours) {
    res.status(400).json({
      error: `Bookings require at least ${minHours} hour${minHours !== 1 ? "s" : ""} advance notice. Please select a later time.`,
      code: "LEAD_TIME_VIOLATION",
      minHours,
    });
    return;
  }

  // Get Florida tax rate from settings (stored as decimal: 0.07 = 7%)
  const taxRateStr = await getSetting("florida_tax_rate", "0.07");
  let taxRate = parseFloat(taxRateStr);
  // Normalise: if stored as whole percent (e.g. 7 instead of 0.07), convert
  if (taxRate > 1) taxRate = taxRate / 100;

  // Get pricing rule from DB for this vehicle class
  const { baseFare, ratePerMile, airportFee: ruleAirportFee } = await getPricingForClass(vc);

  let distanceCharge: number;
  let estimatedDistance: number;
  let estimatedDuration: number;

  if (charterMode === "hourly" && charterHours > 0) {
    // Hourly charter — price is time-based, not distance-based
    const hourlyRate = HOURLY_RATES[vc] ?? baseFare * 1.5;
    distanceCharge = Math.round((hourlyRate * charterHours - baseFare) * 100) / 100;
    if (distanceCharge < 0) distanceCharge = 0;
    // For display purposes, estimate ~25 mph average city speed
    estimatedDistance = charterHours * 25;
    estimatedDuration = charterHours * 60;
  } else {
    // Route-based (single or multi-stop)
    const mapsResult = await getDirectionsDistance(pickupAddress, dropoffAddress, waypoints.length > 0 ? waypoints : undefined);
    const fallback = fallbackDistance(pickupAddress, dropoffAddress);
    estimatedDistance = mapsResult?.distance ?? fallback.distance;
    estimatedDuration = mapsResult?.duration ?? fallback.duration;
    distanceCharge = Math.round(estimatedDistance * ratePerMile * 100) / 100;
  }

  // Airport fee: apply from pricing rule if either endpoint is an airport
  const allAddresses = [pickupAddress, dropoffAddress, ...waypoints];
  const isAirport = allAddresses.some(a => isAirportTrip(a));
  const airportFee = isAirport ? ruleAirportFee : 0;

  // Geo zone pricing modifier (checked against all route addresses)
  const zoneMultiplier = await getZoneMultiplier(allAddresses.map(resolveAddress));

  const subtotalBeforeZone = Math.round((baseFare + distanceCharge + airportFee) * 100) / 100;
  const subtotal = Math.round(subtotalBeforeZone * zoneMultiplier * 100) / 100;
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const totalWithTax = Math.round((subtotal + taxAmount) * 100) / 100;

  res.json(
    GetQuoteResponse.parse({
      vehicleClass: vc,
      estimatedPrice: subtotal,
      baseFare,
      distanceCharge,
      airportFee,
      taxRate,
      taxAmount,
      totalWithTax,
      estimatedDuration,
      estimatedDistance,
      currency: "USD",
    })
  );
});

export default router;
