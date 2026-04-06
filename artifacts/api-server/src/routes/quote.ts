import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetQuoteBody, GetQuoteResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const BASE_FARES: Record<string, number> = {
  business: 55,
  suv: 75,
};

const RATE_PER_MILE: Record<string, number> = {
  business: 3.5,
  suv: 4.0,
};

// Canonical airport addresses for resolving shortcodes passed from the frontend
const AIRPORT_ADDRESSES: Record<string, string> = {
  FLL: "Fort Lauderdale-Hollywood International Airport, 100 Terminal Dr, Fort Lauderdale, FL 33315",
  MIA: "Miami International Airport, 2100 NW 42nd Ave, Miami, FL 33142",
  PBI: "Palm Beach International Airport, 1000 James L Turnage Blvd, West Palm Beach, FL 33406",
};

// AIRPORT_KEYWORDS is used only to decide whether to add the airport surcharge
const AIRPORT_KEYWORDS = ["FLL", "MIA", "PBI", "Fort Lauderdale-Hollywood", "Miami International", "Palm Beach International"];

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

    const leg = data.routes[0].legs[0];
    if (!leg) return null;

    const distanceMiles = leg.distance.value / 1609.344;
    const durationMinutes = Math.round(leg.duration.value / 60);

    return {
      distance: Math.round(distanceMiles * 10) / 10,
      duration: durationMinutes,
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

async function getSetting(key: string, fallback: string): Promise<string> {
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

router.post("/quote", async (req, res): Promise<void> => {
  const parsed = GetQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(parsed.error.errors);
    return;
  }

  const { pickupAddress, dropoffAddress, vehicleClass, passengers, pickupAt } = parsed.data;
  const vc = vehicleClass as string;

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

  // Get Florida tax rate from settings
  const taxRateStr = await getSetting("florida_tax_rate", "0.07");
  const taxRate = parseFloat(taxRateStr);

  const baseFare = BASE_FARES[vc] ?? 35;
  const ratePerMile = RATE_PER_MILE[vc] ?? 2.5;

  // Driving route distance via Directions API (falls back to hardcoded estimates)
  const mapsResult = await getDirectionsDistance(pickupAddress, dropoffAddress);
  const { distance: estimatedDistance, duration: estimatedDuration } =
    mapsResult ?? fallbackDistance(pickupAddress, dropoffAddress);

  const distanceCharge = Math.round(estimatedDistance * ratePerMile * 100) / 100;
  const airportFee = 0;
  const subtotal = Math.round((baseFare + distanceCharge) * 100) / 100;
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
