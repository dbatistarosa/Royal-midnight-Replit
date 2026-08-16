// Pure pricing/geo helpers extracted from routes/quote.ts so the fare math
// that decides what a customer is charged can be unit-tested without
// spinning up Express, a DB connection, or a live Mapbox call.

// Canonical airport addresses for resolving shortcodes passed from the frontend
export const AIRPORT_ADDRESSES: Record<string, string> = {
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

// Used only to decide whether to add the airport surcharge
const AIRPORT_KEYWORDS = [
  "FLL", "MIA", "PBI", "MCO", "TPA", "JAX", "RSW", "SRQ", "PIE",
  "GNV", "TLH", "EYW", "DAB", "MLB", "VPS", "ECP", "PNS", "OCF", "SFB",
  "Fort Lauderdale-Hollywood", "Miami International", "Palm Beach International",
  "Orlando International", "Tampa International", "Jacksonville International",
  "Southwest Florida International", "Sarasota Bradenton", "St. Pete-Clearwater",
  "Key West International", "Daytona Beach International", "Melbourne Orlando",
  "Tallahassee International", "Gainesville Regional", "Pensacola International",
];

export function isAirportTrip(address: string): boolean {
  return AIRPORT_KEYWORDS.some((k) => address.toLowerCase().includes(k.toLowerCase()));
}

/** Resolve an address entered by the user to a canonical geocodable string.
 *  Airport shortcuts selected from the dropdown look like "FLL - Fort Lauderdale-Hollywood International Airport"
 *  or the full Place description. We normalise both. */
export function resolveAddress(raw: string): string {
  const upper = raw.trim().toUpperCase();
  // Direct code match (e.g. "FLL", "MIA", "PBI")
  if (AIRPORT_ADDRESSES[upper]) return AIRPORT_ADDRESSES[upper];
  // Shortcut format "FLL - Fort Lauderdale-Hollywood International Airport"
  for (const code of Object.keys(AIRPORT_ADDRESSES)) {
    if (upper.startsWith(code + " -") || upper.startsWith(code + "-")) {
      return AIRPORT_ADDRESSES[code]!;
    }
  }
  return raw.trim();
}

// Fallback distances (road miles) — only used if the Mapbox API is unavailable
export function fallbackDistance(pickup: string, dropoff: string): { distance: number; duration: number } {
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

/** Haversine distance in km between two lat/lng points */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Ray-casting point-in-polygon. coords: [[lng,lat],...] (GeoJSON order) */
export function pointInPolygon(lat: number, lng: number, coords: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i]![0]!, yi = coords[i]![1]!;
    const xj = coords[j]![0]!, yj = coords[j]![1]!;
    const intersect = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** The stored shape of a geo zone, as far as the geometry test is concerned. */
export type ZoneGeometry = {
  type: string;          // "circle" | "polygon"
  geometry: string;      // JSON string
};

/**
 * Does a point fall inside a zone?
 *
 * Both the pricing surcharge and the driver service-area filter ask exactly
 * this question, so it lives in one place and is unit-tested rather than being
 * re-implemented per caller. Malformed geometry answers "no": a zone nobody can
 * parse must not silently swallow trips (for the pool filter) or silently
 * surcharge them (for pricing).
 */
export function pointInZone(lat: number, lng: number, zone: ZoneGeometry): boolean {
  try {
    const geom = JSON.parse(zone.geometry) as Record<string, unknown>;
    if (zone.type === "circle") {
      const center = geom["center"] as [number, number] | undefined;
      const radiusKm = geom["radiusKm"] as number | undefined;
      if (!Array.isArray(center) || center.length !== 2 || typeof radiusKm !== "number") return false;
      return haversineKm(lat, lng, center[0], center[1]) <= radiusKm;
    }
    if (zone.type === "polygon") {
      const coords = geom["coordinates"] as number[][] | undefined;
      // A ring needs at least three distinct corners to enclose anything; a
      // shorter array would make pointInPolygon return a meaningless answer.
      if (!Array.isArray(coords) || coords.length < 3) return false;
      return pointInPolygon(lat, lng, coords);
    }
    return false;
  } catch {
    return false;
  }
}

/** Normalises a percent-style setting that may be stored as a whole number
 *  (e.g. "7" meaning 7%) or as a decimal fraction (e.g. "0.07"). */
export function normalizePercentRate(rate: number): number {
  return rate > 1 ? rate / 100 : rate;
}

/** Pure fare assembly — given the priced inputs (already resolved from the
 *  DB/Mapbox/settings layer), computes every line item shown to the customer.
 *  This is the function that decides what gets charged; keep it dependency-free. */
export function computeFareBreakdown(params: {
  baseFare: number;
  distanceCharge: number;
  airportFee: number;
  zoneMultiplier: number;
  /** 0-100. Corporate-account volume discount, applied after zone surge and
   *  before tax (so tax is never charged on the discounted-away portion). */
  corporateDiscountPct?: number;
  taxRate: number;
  cardProcessingFeeRate: number;
}): {
  subtotalBeforeZone: number;
  subtotal: number;
  surgeAdjustment: number;
  corporateDiscountAmount: number;
  taxAmount: number;
  cardProcessingFee: number;
  totalWithTax: number;
} {
  const { baseFare, distanceCharge, airportFee, zoneMultiplier, corporateDiscountPct = 0, taxRate, cardProcessingFeeRate } = params;

  const subtotalBeforeZone = Math.round((baseFare + distanceCharge + airportFee) * 100) / 100;
  const subtotalAfterZone = Math.round(subtotalBeforeZone * zoneMultiplier * 100) / 100;
  // Any difference from the zone multiplier, called out as its own line so
  // nothing is folded silently into the subtotal.
  const surgeAdjustment = Math.round((subtotalAfterZone - subtotalBeforeZone) * 100) / 100;

  const corporateDiscountAmount = Math.round(subtotalAfterZone * (corporateDiscountPct / 100) * 100) / 100;
  const subtotal = Math.round((subtotalAfterZone - corporateDiscountAmount) * 100) / 100;

  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const cardProcessingFee = Math.round((subtotal + taxAmount) * cardProcessingFeeRate * 100) / 100;
  const totalWithTax = Math.round((subtotal + taxAmount + cardProcessingFee) * 100) / 100;

  return { subtotalBeforeZone, subtotal, surgeAdjustment, corporateDiscountAmount, taxAmount, cardProcessingFee, totalWithTax };
}
