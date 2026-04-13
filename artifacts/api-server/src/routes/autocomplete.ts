import { Router, type IRouter } from "express";

const router: IRouter = Router();

const SOUTH_FLORIDA_AIRPORTS: Array<{ code: string; name: string; address: string; lat: number; lng: number }> = [
  { code: "FLL", name: "Fort Lauderdale-Hollywood International Airport", address: "100 Terminal Dr, Fort Lauderdale, FL 33315", lat: 26.0742, lng: -80.1506 },
  { code: "MIA", name: "Miami International Airport", address: "2100 NW 42nd Ave, Miami, FL 33142", lat: 25.7959, lng: -80.2870 },
  { code: "PBI", name: "Palm Beach International Airport", address: "1000 James L Turnage Blvd, West Palm Beach, FL 33406", lat: 26.6832, lng: -80.0956 },
];

// All major Florida airports — shown for drop-off (statewide service)
const ALL_FLORIDA_AIRPORTS: Array<{ code: string; name: string; address: string; lat: number; lng: number }> = [
  ...SOUTH_FLORIDA_AIRPORTS,
  { code: "MCO", name: "Orlando International Airport", address: "One Jeff Fuqua Blvd, Orlando, FL 32827", lat: 28.4312, lng: -81.3081 },
  { code: "TPA", name: "Tampa International Airport", address: "4100 George J Bean Pkwy, Tampa, FL 33607", lat: 27.9756, lng: -82.5332 },
  { code: "JAX", name: "Jacksonville International Airport", address: "2400 Yankee Clipper Dr, Jacksonville, FL 32218", lat: 30.4941, lng: -81.6879 },
  { code: "RSW", name: "Southwest Florida International Airport", address: "11000 Terminal Access Rd, Fort Myers, FL 33913", lat: 26.5362, lng: -81.7552 },
  { code: "SRQ", name: "Sarasota Bradenton International Airport", address: "6000 Airport Cir, Sarasota, FL 34243", lat: 27.3954, lng: -82.5544 },
  { code: "PIE", name: "St. Pete-Clearwater International Airport", address: "14700 Terminal Blvd, Clearwater, FL 33762", lat: 27.9102, lng: -82.6874 },
  { code: "GNV", name: "Gainesville Regional Airport", address: "3880 NE 39th Ave, Gainesville, FL 32609", lat: 29.6900, lng: -82.2717 },
  { code: "TLH", name: "Tallahassee International Airport", address: "3300 Capital Circle SW, Tallahassee, FL 32310", lat: 30.3965, lng: -84.3503 },
  { code: "EYW", name: "Key West International Airport", address: "3491 S Roosevelt Blvd, Key West, FL 33040", lat: 24.5562, lng: -81.7596 },
  { code: "DAB", name: "Daytona Beach International Airport", address: "700 Catalina Dr, Daytona Beach, FL 32114", lat: 29.1799, lng: -81.0581 },
  { code: "MLB", name: "Melbourne Orlando International Airport", address: "1 Air Terminal Pkwy, Melbourne, FL 32901", lat: 28.1028, lng: -80.6453 },
  { code: "VPS", name: "Destin–Fort Walton Beach Airport", address: "1 Putt-Putt Place, Eglin AFB, FL 32542", lat: 30.4835, lng: -86.5254 },
  { code: "ECP", name: "Northwest Florida Beaches International Airport", address: "6300 West Bay Pkwy, Panama City Beach, FL 32409", lat: 30.3580, lng: -85.7954 },
  { code: "PNS", name: "Pensacola International Airport", address: "2430 Airport Blvd, Pensacola, FL 32504", lat: 30.4734, lng: -87.1866 },
  { code: "OCF", name: "Ocala International Airport", address: "1770 SW 60th Ave, Ocala, FL 34474", lat: 29.1726, lng: -82.2241 },
  { code: "SFB", name: "Orlando Sanford International Airport", address: "1200 Red Cleveland Blvd, Sanford, FL 32773", lat: 28.7776, lng: -81.2375 },
];

router.get("/autocomplete", async (req, res): Promise<void> => {
  const rawQ = (req.query["q"] as string || "").trim();
  if (rawQ.length > 200) {
    res.status(400).json({ error: "Query parameter too long (max 200 characters)" });
    return;
  }
  const query = rawQ;
  // mode=dropoff → show all FL airports + FL-wide address bias
  // mode=pickup (default) → show only South FL airports + South FL bias
  const mode = (req.query["mode"] as string || "pickup");
  const isDropoff = mode === "dropoff";
  const airportPool = isDropoff ? ALL_FLORIDA_AIRPORTS : SOUTH_FLORIDA_AIRPORTS;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!query) {
    res.json({ airports: airportPool, suggestions: [] });
    return;
  }

  // Check for airport shortcode match first
  const upperQuery = query.toUpperCase();
  const airportMatches = airportPool.filter(a =>
    a.code.includes(upperQuery) ||
    a.name.toLowerCase().includes(query.toLowerCase()) ||
    upperQuery.includes(a.code)
  );

  if (!apiKey) {
    res.json({ airports: airportMatches, suggestions: [] });
    return;
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", query);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("components", "country:us");

    if (isDropoff) {
      // Florida-wide bias: center of the state
      url.searchParams.set("location", "28.0,-82.0");
      url.searchParams.set("radius", "500000"); // ~310 miles — covers all of FL
    } else {
      // South Florida bias (pickup)
      url.searchParams.set("location", "26.0,-80.1");
      url.searchParams.set("radius", "160000"); // ~100 miles around South Florida
    }
    url.searchParams.set("strictbounds", "false");

    const response = await fetch(url.toString());
    const data = await response.json() as {
      status: string;
      predictions?: Array<{
        place_id: string;
        description: string;
        structured_formatting: { main_text: string; secondary_text: string };
      }>;
    };

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      req.log.warn({ status: data.status }, "Places Autocomplete returned non-OK status");
      res.json({ airports: airportMatches, suggestions: [] });
      return;
    }

    const suggestions = (data.predictions || []).slice(0, 5).map(p => ({
      placeId: p.place_id,
      text: p.description,
      mainText: p.structured_formatting?.main_text || p.description,
      secondaryText: p.structured_formatting?.secondary_text || "",
    }));

    res.json({ airports: airportMatches, suggestions });
  } catch {
    res.json({ airports: airportMatches, suggestions: [] });
  }
});

export default router;
