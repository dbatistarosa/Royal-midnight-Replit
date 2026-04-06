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

const AIRPORTS = ["FLL", "MIA", "PBI", "Fort Lauderdale", "Miami International", "Palm Beach"];

function isAirportTrip(address: string): boolean {
  return AIRPORTS.some((a) => address.toLowerCase().includes(a.toLowerCase()));
}

function fallbackDistance(pickup: string, dropoff: string): { distance: number; duration: number } {
  const isPickupAirport = isAirportTrip(pickup);
  const isDropoffAirport = isAirportTrip(dropoff);
  if (isPickupAirport && isDropoffAirport) {
    if (
      (pickup.includes("FLL") || pickup.includes("Fort Lauderdale")) &&
      (dropoff.includes("MIA") || dropoff.includes("Miami"))
    ) return { distance: 32, duration: 45 };
    if (
      (pickup.includes("MIA") || pickup.includes("Miami")) &&
      (dropoff.includes("FLL") || dropoff.includes("Fort Lauderdale"))
    ) return { distance: 32, duration: 45 };
    if (
      (pickup.includes("PBI") || pickup.includes("Palm Beach")) &&
      (dropoff.includes("MIA") || dropoff.includes("Miami"))
    ) return { distance: 75, duration: 90 };
    return { distance: 40, duration: 55 };
  }
  const dist = 18 + Math.random() * 15;
  return { distance: Math.round(dist * 10) / 10, duration: Math.round(dist * 2.2) };
}

async function getGoogleMapsDistance(
  pickup: string,
  dropoff: string
): Promise<{ distance: number; duration: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
    url.searchParams.set("origins", pickup);
    url.searchParams.set("destinations", dropoff);
    url.searchParams.set("units", "imperial");
    url.searchParams.set("key", apiKey);
    const response = await fetch(url.toString());
    const data = await response.json() as any;
    if (data.status !== "OK") return null;
    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK") return null;
    const distanceMiles = element.distance.value / 1609.34;
    const durationMinutes = Math.round(element.duration.value / 60);
    return { distance: Math.round(distanceMiles * 10) / 10, duration: durationMinutes };
  } catch {
    return null;
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

router.post("/quote", async (req, res): Promise<void> => {
  const parsed = GetQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(parsed.error.errors);
    return;
  }

  const { pickupAddress, dropoffAddress, vehicleClass, passengers, pickupAt } = parsed.data;
  const vc = vehicleClass as string;
  const numPassengers = Number(passengers) || 1;

  // Validate minimum lead time (EST = UTC-4 in summer, UTC-5 in winter — use UTC offset dynamically)
  const minHoursStr = await getSetting("min_booking_hours", "2");
  const minHours = parseFloat(minHoursStr);
  const pickupDate = new Date(pickupAt);
  const nowUtc = Date.now();
  const leadTimeMs = pickupDate.getTime() - nowUtc;
  const leadTimeHours = leadTimeMs / (1000 * 60 * 60);
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

  const mapsResult = await getGoogleMapsDistance(pickupAddress, dropoffAddress);
  const { distance: estimatedDistance, duration: estimatedDuration } =
    mapsResult ?? fallbackDistance(pickupAddress, dropoffAddress);

  const distanceCharge = Math.round(estimatedDistance * ratePerMile * 100) / 100;
  const airportFee = isAirportTrip(pickupAddress) || isAirportTrip(dropoffAddress) ? 15 : 0;
  const subtotal = Math.round((baseFare + distanceCharge + airportFee) * 100) / 100;
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const totalWithTax = Math.round((subtotal + taxAmount) * 100) / 100;

  // estimatedPrice = subtotal (pre-tax, for backward compat)
  const estimatedPrice = subtotal;

  res.json(
    GetQuoteResponse.parse({
      vehicleClass: vc,
      estimatedPrice,
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
