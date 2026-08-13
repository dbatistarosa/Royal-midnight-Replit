import { Router, type IRouter } from "express";
import { db, settingsTable, pricingRulesTable, geoZonesTable, usersTable, corporateAccountsTable, fixedRoutesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { GetQuoteBody, GetQuoteResponse } from "@workspace/api-zod";
import { optionalAuth } from "../middleware/auth.js";
import {
  isAirportTrip,
  resolveAddress,
  fallbackDistance,
  haversineKm,
  pointInPolygon,
  normalizePercentRate,
  computeFareBreakdown,
} from "../lib/pricing";

const router: IRouter = Router();

export const DEFAULT_BASE_FARES: Record<string, number> = {
  business: 55,
  suv: 75,
};

export const DEFAULT_RATE_PER_MILE: Record<string, number> = {
  business: 3.5,
  suv: 4.0,
};

export const DEFAULT_INCLUDED_MILES: Record<string, number> = {
  business: 0,
  suv: 0,
};

/** Forward-geocode an address to Mapbox [lng, lat] coordinates. */
async function geocodeMapbox(address: string, token: string): Promise<[number, number] | null> {
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");
  url.searchParams.set("country", "US");
  const res = await fetch(url.toString());
  const data = await res.json() as { features?: Array<{ center: [number, number] }> };
  return data.features?.[0]?.center ?? null;
}

async function getDirectionsDistance(
  pickup: string,
  dropoff: string,
  waypoints?: string[],
): Promise<{ distance: number; duration: number } | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return null;

  const origin = resolveAddress(pickup);
  const destination = resolveAddress(dropoff);
  const stops = (waypoints ?? []).map(resolveAddress);

  try {
    // Mapbox Directions takes coordinates, not addresses, so geocode every
    // stop first, then request the whole multi-stop route in one call.
    const coords = await Promise.all([origin, ...stops, destination].map((addr) => geocodeMapbox(addr, token)));
    if (coords.some((c) => !c)) return null;

    const coordString = coords.map((c) => `${c![0]},${c![1]}`).join(";");
    const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordString}`);
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
    return {
      distance: Math.round((route.distance / 1609.344) * 10) / 10,
      duration: Math.round(route.duration / 60),
    };
  } catch {
    return null;
  }
}

// ── Geo Zone helpers ──────────────────────────────────────────────────────────

/** Geocode an address to lat/lng via Mapbox Geocoding API (best-effort) */
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const coord = await geocodeMapbox(address, token);
    return coord ? { lat: coord[1], lng: coord[0] } : null;
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
 *  Falls back to hardcoded defaults if none found — the DB row (set via
 *  /admin/pricing) is always authoritative when it exists. */
async function getPricingForClass(vc: string): Promise<{ baseFare: number; ratePerMile: number; includedMiles: number; airportFee: number; hourlyRate: number | null }> {
  try {
    const [rule] = await db
      .select()
      .from(pricingRulesTable)
      .where(and(eq(pricingRulesTable.vehicleClass, vc), eq(pricingRulesTable.isActive, true)));

    if (rule) {
      return {
        baseFare: parseFloat(rule.baseFare ?? "0") || (DEFAULT_BASE_FARES[vc] ?? 35),
        ratePerMile: parseFloat(rule.ratePerMile ?? "0") || (DEFAULT_RATE_PER_MILE[vc] ?? 2.5),
        includedMiles: parseFloat(rule.includedMiles ?? "0") || 0,
        airportFee: parseFloat(rule.airportSurcharge ?? "0") || 0,
        hourlyRate: rule.hourlyRate != null ? parseFloat(rule.hourlyRate) || null : null,
      };
    }
  } catch {
    // fall through to defaults
  }

  return {
    baseFare: DEFAULT_BASE_FARES[vc] ?? 35,
    ratePerMile: DEFAULT_RATE_PER_MILE[vc] ?? 2.5,
    includedMiles: DEFAULT_INCLUDED_MILES[vc] ?? 0,
    airportFee: 0,
    hourlyRate: null,
  };
}

// Hourly charter rates per vehicle class ($/hr, before tax) — only used when a
// vehicle class has no admin-set hourlyRate on its pricing_rules row.
export const HOURLY_RATES: Record<string, number> = {
  business: 95,
  suv: 125,
};

/** A logged-in corporate user's company-level volume discount (0 if none, or
 *  if the caller isn't a corporate user / has no linked billing account yet). */
async function getCorporateDiscountPct(userId: number | undefined): Promise<number> {
  if (!userId) return 0;
  try {
    const [row] = await db
      .select({ pct: corporateAccountsTable.volumeDiscountPct, status: corporateAccountsTable.status })
      .from(usersTable)
      .innerJoin(corporateAccountsTable, eq(usersTable.corporateAccountId, corporateAccountsTable.id))
      .where(eq(usersTable.id, userId));
    if (!row || row.status !== "active") return 0;
    return parseFloat(row.pct) || 0;
  } catch {
    return 0;
  }
}

// ── Shared quote engine ───────────────────────────────────────────────────────
// This logic used to live inline in the POST /quote handler, which meant the
// only way to price a trip was to answer an HTTP request. Booking creation
// therefore had no choice but to trust the price the client sent. Extracting it
// lets the server re-derive the fare itself at booking time (CN-001).
// The /quote handler below is now a thin wrapper — behaviour is unchanged.

export interface QuoteInput {
  pickupAddress: string;
  dropoffAddress: string;
  vehicleClass: string;
  pickupAt: string;
  waypoints?: string[] | undefined;
  charterMode?: string | undefined;
  charterHours?: number | undefined;
  /** Logged-in caller, used for the corporate volume discount. */
  userId?: number | undefined;
  /** Admin-created bookings bypass the customer-facing lead-time rule. */
  skipLeadTimeCheck?: boolean | undefined;
}

export interface QuoteBreakdown {
  vehicleClass: string;
  estimatedPrice: number;
  baseFare: number;
  includedMiles: number;
  billableMiles: number;
  distanceCharge: number;
  airportFee: number;
  surgeAdjustment: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  cardProcessingFeeRate: number;
  cardProcessingFee: number;
  totalWithTax: number;
  estimatedDuration: number;
  estimatedDistance: number;
  currency: string;
  fixedRoutePrice?: number | null;
  fixedRouteId?: number | null;
}

export type QuoteOutcome =
  | { ok: true; quote: QuoteBreakdown }
  | { ok: false; status: number; body: unknown };

export async function computeQuote(input: QuoteInput): Promise<QuoteOutcome> {
  const { pickupAddress, dropoffAddress, pickupAt } = input;
  const vc = input.vehicleClass;

  // Multi-stop + charter extensions (not in the generated Zod schema yet)
  const waypoints: string[] = (input.waypoints ?? []).filter(
    w => typeof w === "string" && w.trim(),
  );
  const charterMode: string = input.charterMode ?? "route";
  const charterHours: number = input.charterHours ?? 0;

  // Validate minimum lead time
  if (!input.skipLeadTimeCheck) {
    const minHoursStr = await getSetting("min_booking_hours", "2");
    const minHours = parseFloat(minHoursStr);
    const pickupDate = new Date(pickupAt);
    const leadTimeHours = (pickupDate.getTime() - Date.now()) / (1000 * 60 * 60);
    if (leadTimeHours < minHours) {
      return {
        ok: false,
        status: 400,
        body: {
          error: `Bookings require at least ${minHours} hour${minHours !== 1 ? "s" : ""} advance notice. Please select a later time.`,
          code: "LEAD_TIME_VIOLATION",
          minHours,
        },
      };
    }
  }

  // Get Florida tax rate from settings (stored as decimal: 0.07 = 7%, or as a
  // whole percent like 7 — normalizePercentRate() handles both forms)
  const taxRateStr = await getSetting("florida_tax_rate", "0.07");
  const taxRate = normalizePercentRate(parseFloat(taxRateStr));

  // Get pricing rule from DB for this vehicle class
  const { baseFare, ratePerMile, includedMiles: ruleIncludedMiles, airportFee: ruleAirportFee, hourlyRate: ruleHourlyRate } = await getPricingForClass(vc);

  let distanceCharge: number;
  let estimatedDistance: number;
  let estimatedDuration: number;
  let includedMiles: number;
  let billableMiles: number;

  if (charterMode === "hourly" && charterHours > 0) {
    // Hourly charter — price is time-based, not distance-based, so the
    // included-miles allowance (which is mileage pricing) doesn't apply.
    const hourlyRate = ruleHourlyRate ?? HOURLY_RATES[vc] ?? baseFare * 1.5;
    distanceCharge = Math.round((hourlyRate * charterHours - baseFare) * 100) / 100;
    if (distanceCharge < 0) distanceCharge = 0;
    // For display purposes, estimate ~25 mph average city speed
    estimatedDistance = charterHours * 25;
    estimatedDuration = charterHours * 60;
    includedMiles = 0;
    billableMiles = 0;
  } else {
    // Route-based (single or multi-stop)
    const mapsResult = await getDirectionsDistance(pickupAddress, dropoffAddress, waypoints.length > 0 ? waypoints : undefined);
    const fallback = fallbackDistance(pickupAddress, dropoffAddress);
    estimatedDistance = mapsResult?.distance ?? fallback.distance;
    estimatedDuration = mapsResult?.duration ?? fallback.duration;
    includedMiles = ruleIncludedMiles;
    // Base fare already covers the first `includedMiles` miles — only the
    // remainder is billed at the per-mile rate.
    billableMiles = Math.round(Math.max(0, estimatedDistance - includedMiles) * 10) / 10;
    distanceCharge = Math.round(billableMiles * ratePerMile * 100) / 100;
  }

  // Airport fee: apply from pricing rule if either endpoint is an airport
  const allAddresses = [pickupAddress, dropoffAddress, ...waypoints];
  const isAirport = allAddresses.some(a => isAirportTrip(a));
  const airportFee = isAirport ? ruleAirportFee : 0;

  // Geo zone pricing modifier (checked against all route addresses)
  const zoneMultiplier = await getZoneMultiplier(allAddresses.map(resolveAddress));

  // Card processing fee, passed through to the customer and shown as its
  // own line item (admin-configurable via the `cc_fee_pct` setting).
  const ccFeeRateStr = await getSetting("cc_fee_pct", "0");
  const cardProcessingFeeRate = normalizePercentRate(parseFloat(ccFeeRateStr));

  // Corporate volume discount — only applies to a logged-in corporate user
  // with an active billing account; anonymous/passenger quotes are unaffected.
  const corporateDiscountPct = await getCorporateDiscountPct(input.userId);

  const { subtotal, surgeAdjustment, taxAmount, cardProcessingFee, totalWithTax } = computeFareBreakdown({
    baseFare,
    distanceCharge,
    airportFee,
    zoneMultiplier,
    corporateDiscountPct,
    taxRate,
    cardProcessingFeeRate,
  });

  // ── Fixed hotel-to-airport route detection ────────────────────────────────
  // Per-airport keywords so we can identify the destination airport code from
  // a free-form Mapbox autocomplete address (which rarely contains the IATA code).
  const AIRPORT_CODE_KEYWORDS: Record<string, string[]> = {
    fll: ["fll", "fort lauderdale-hollywood", "fort lauderdale hollywood", "fort lauderdale international"],
    mia: ["mia", "miami international", "miami intl"],
    pbi: ["pbi", "palm beach international"],
    opa: ["opa", "opa-locka", "opa locka", "opa locka executive"],
    mco: ["mco", "orlando international"],
    tpa: ["tpa", "tampa international"],
    jax: ["jax", "jacksonville international"],
    rsw: ["rsw", "southwest florida international", "fort myers"],
    srq: ["srq", "sarasota bradenton"],
    sfb: ["sfb", "orlando sanford"],
  };

  function detectAirportCode(addr: string): string | null {
    const lower = addr.toLowerCase();
    for (const [code, keywords] of Object.entries(AIRPORT_CODE_KEYWORDS)) {
      if (keywords.some(k => lower.includes(k))) return code;
    }
    return null;
  }

  const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

  // Does this free-form address refer to the route's hotel? Matches on the
  // hotel name OR the street line of the stored address (split on commas
  // BEFORE normalizing — norm() strips commas, which used to break this).
  function hotelMatch(address: string, name: string, addr: string): boolean {
    const full = norm(address);
    const n = norm(name);
    if (n.length > 3 && full.includes(n)) return true;
    const street = norm(addr.split(",")[0] ?? "");
    if (street.length > 4 && full.includes(street)) return true;
    const addrStreet = norm(address.split(",")[0] ?? "");
    if (addrStreet.length > 4 && norm(addr).includes(addrStreet)) return true;
    return false;
  }

  let fixedRoutePrice: number | null = null;
  let fixedRouteId: number | null = null;
  // Flat rates are point-to-point products only: hourly charters and
  // multi-stop itineraries always use their computed pricing.
  const flatRateEligible = charterMode === "route" && waypoints.length === 0;
  if (flatRateEligible) try {
    // Fetch ALL active routes — class matching is done in code to support
    // new multi-class airportsJson format alongside legacy single-class rows.
    const activeRoutes = await db.select().from(fixedRoutesTable)
      .where(eq(fixedRoutesTable.isActive, true));

    const airportInDropoff = detectAirportCode(dropoffAddress);
    const airportInPickup = detectAirportCode(pickupAddress);

    for (const route of activeRoutes) {
      // Flat rates apply in BOTH directions: hotel → airport and airport → hotel.
      let matchedAirport: string | null = null;
      let airportSideAddress = "";
      if (airportInDropoff && hotelMatch(pickupAddress, route.originName, route.originAddress)) {
        matchedAirport = airportInDropoff;
        airportSideAddress = dropoffAddress;
      } else if (airportInPickup && hotelMatch(dropoffAddress, route.originName, route.originAddress)) {
        matchedAirport = airportInPickup;
        airportSideAddress = pickupAddress;
      } else if (!route.airportsJson?.length && hotelMatch(pickupAddress, route.originName, route.originAddress)) {
        // Legacy rows can still match the airport by destination name/code text
        // even when keyword detection found nothing.
        airportSideAddress = dropoffAddress;
      } else {
        continue;
      }

      // New multi-airport format (airportsJson present)
      if (route.airportsJson?.length) {
        if (!matchedAirport) continue;
        const apt = route.airportsJson.find(
          a => a.code.toLowerCase() === matchedAirport,
        );
        if (!apt) continue;
        const price = apt.prices[vc];
        if (price == null) continue;
        fixedRoutePrice = price;
        fixedRouteId = route.id;
        break;
      }

      // Legacy single-class format
      if (route.vehicleClass !== vc && route.vehicleClass !== "all") continue;
      const airportSideLower = airportSideAddress.toLowerCase();
      const legacyDestMatch = (matchedAirport && matchedAirport === route.destinationCode.toLowerCase()) ||
        airportSideLower.includes(route.destinationCode.toLowerCase()) ||
        airportSideLower.includes(route.destinationName.toLowerCase().split("(")[0]!.trim());
      if (!legacyDestMatch) continue;
      fixedRoutePrice = parseFloat(String(route.fixedPrice));
      fixedRouteId = route.id;
      break;
    }
  } catch { /* fixed-route lookup is non-fatal */ }

  // When a flat rate applies, recalculate the full fare breakdown using the
  // fixed price as the base — so tax and CC fee are computed on the flat rate,
  // not the distance-computed price. Airport fee is $0 (already baked into flat rate).
  if (fixedRoutePrice != null) {
    const fixedBreakdown = computeFareBreakdown({
      baseFare: fixedRoutePrice,
      distanceCharge: 0,
      airportFee: 0,
      zoneMultiplier: 1,
      corporateDiscountPct,
      taxRate,
      cardProcessingFeeRate,
    });
    return {
      ok: true,
      quote: {
        vehicleClass: vc,
        estimatedPrice: fixedBreakdown.subtotal,
        baseFare: fixedRoutePrice,
        includedMiles: 0,
        billableMiles: 0,
        distanceCharge: 0,
        airportFee: 0,
        surgeAdjustment: 0,
        subtotal: fixedBreakdown.subtotal,
        taxRate,
        taxAmount: fixedBreakdown.taxAmount,
        cardProcessingFeeRate,
        cardProcessingFee: fixedBreakdown.cardProcessingFee,
        totalWithTax: fixedBreakdown.totalWithTax,
        estimatedDuration,
        estimatedDistance,
        currency: "USD",
        fixedRoutePrice,
        fixedRouteId,
      },
    };
  }

  return {
    ok: true,
    quote: {
      vehicleClass: vc,
      estimatedPrice: subtotal,
      baseFare,
      includedMiles,
      billableMiles,
      distanceCharge,
      airportFee,
      surgeAdjustment,
      subtotal,
      taxRate,
      taxAmount,
      cardProcessingFeeRate,
      cardProcessingFee,
      totalWithTax,
      estimatedDuration,
      estimatedDistance,
      currency: "USD",
    },
  };
}

/** Read the multi-stop / charter extensions that aren't in the generated Zod
 *  schema yet. `waypoints` arrives as an array from /quote but as a JSON string
 *  from the booking form, so both shapes are accepted. */
export function readQuoteExtensions(rawBody: unknown): {
  waypoints: string[];
  charterMode: string;
  charterHours: number;
} {
  const body = (rawBody ?? {}) as Record<string, unknown>;

  let waypoints: string[] = [];
  if (Array.isArray(body["waypoints"])) {
    waypoints = body["waypoints"] as string[];
  } else if (typeof body["waypoints"] === "string" && body["waypoints"]) {
    try {
      const decoded = JSON.parse(body["waypoints"] as string);
      if (Array.isArray(decoded)) waypoints = decoded as string[];
    } catch {
      // malformed waypoints — price as a point-to-point trip
    }
  }

  return {
    waypoints: waypoints.filter(w => typeof w === "string" && w.trim()),
    charterMode: typeof body["charterMode"] === "string" ? (body["charterMode"] as string) : "route",
    charterHours: typeof body["charterHours"] === "number" ? (body["charterHours"] as number) : 0,
  };
}

router.post("/quote", optionalAuth, async (req, res): Promise<void> => {
  const parsed = GetQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(parsed.error.errors);
    return;
  }

  const ext = readQuoteExtensions(req.body);
  const outcome = await computeQuote({
    pickupAddress: parsed.data.pickupAddress,
    dropoffAddress: parsed.data.dropoffAddress,
    vehicleClass: parsed.data.vehicleClass as string,
    pickupAt: parsed.data.pickupAt,
    waypoints: ext.waypoints,
    charterMode: ext.charterMode,
    charterHours: ext.charterHours,
    userId: req.currentUser?.userId,
  });

  if (!outcome.ok) {
    res.status(outcome.status).json(outcome.body);
    return;
  }

  res.json(GetQuoteResponse.parse(outcome.quote));
});

export default router;
