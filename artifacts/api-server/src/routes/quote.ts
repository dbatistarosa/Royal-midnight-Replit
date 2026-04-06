import { Router, type IRouter } from "express";
import { GetQuoteBody, GetQuoteResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Base fares by vehicle class (in USD)
const BASE_FARES: Record<string, number> = {
  standard: 35,
  business: 55,
  first_class: 95,
  suv: 75,
  van: 95,
};

// Rate per mile by vehicle class
const RATE_PER_MILE: Record<string, number> = {
  standard: 2.5,
  business: 3.5,
  first_class: 5.5,
  suv: 4.0,
  van: 4.5,
};

// Airport codes for special handling
const AIRPORTS = ["FLL", "MIA", "PBI", "Fort Lauderdale", "Miami International", "Palm Beach"];

function isAirportTrip(address: string): boolean {
  return AIRPORTS.some((a) => address.toLowerCase().includes(a.toLowerCase()));
}

function estimateDistance(pickup: string, dropoff: string): number {
  // Rough distance estimates for South Florida airports and common destinations
  // In a production system this would use Google Maps Distance Matrix API
  const isPickupAirport = isAirportTrip(pickup);
  const isDropoffAirport = isAirportTrip(dropoff);

  if (isPickupAirport && isDropoffAirport) {
    // Airport to airport
    if (
      (pickup.includes("FLL") || pickup.includes("Fort Lauderdale")) &&
      (dropoff.includes("MIA") || dropoff.includes("Miami"))
    ) return 32;
    if (
      (pickup.includes("MIA") || pickup.includes("Miami")) &&
      (dropoff.includes("FLL") || dropoff.includes("Fort Lauderdale"))
    ) return 32;
    if (
      (pickup.includes("PBI") || pickup.includes("Palm Beach")) &&
      (dropoff.includes("MIA") || dropoff.includes("Miami"))
    ) return 75;
    return 40;
  }

  // Default to a reasonable South Florida trip estimate
  return 25 + Math.random() * 20;
}

router.post("/quote", async (req, res): Promise<void> => {
  const parsed = GetQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { pickupAddress, dropoffAddress, vehicleClass } = parsed.data;
  const vc = vehicleClass as string;

  const baseFare = BASE_FARES[vc] ?? 35;
  const ratePerMile = RATE_PER_MILE[vc] ?? 2.5;
  const estimatedDistance = estimateDistance(pickupAddress, dropoffAddress);
  const distanceCharge = Math.round(estimatedDistance * ratePerMile * 100) / 100;
  const airportFee = isAirportTrip(pickupAddress) || isAirportTrip(dropoffAddress) ? 15 : 0;
  const estimatedPrice = Math.round((baseFare + distanceCharge + airportFee) * 100) / 100;
  const estimatedDuration = Math.round(estimatedDistance * 2); // rough minutes

  res.json(
    GetQuoteResponse.parse({
      vehicleClass: vc,
      estimatedPrice,
      baseFare,
      distanceCharge,
      estimatedDuration,
      estimatedDistance: Math.round(estimatedDistance * 10) / 10,
      currency: "USD",
    })
  );
});

export default router;
