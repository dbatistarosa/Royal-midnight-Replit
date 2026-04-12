import { Router, type IRouter } from "express";

const router: IRouter = Router();

const SOUTH_FLORIDA_AIRPORTS: Array<{ code: string; name: string; address: string; lat: number; lng: number }> = [
  { code: "FLL", name: "Fort Lauderdale-Hollywood International Airport", address: "100 Terminal Dr, Fort Lauderdale, FL 33315", lat: 26.0742, lng: -80.1506 },
  { code: "MIA", name: "Miami International Airport", address: "2100 NW 42nd Ave, Miami, FL 33142", lat: 25.7959, lng: -80.2870 },
  { code: "PBI", name: "Palm Beach International Airport", address: "1000 James L Turnage Blvd, West Palm Beach, FL 33406", lat: 26.6832, lng: -80.0956 },
];

router.get("/autocomplete", async (req, res): Promise<void> => {
  const rawQ = (req.query["q"] as string || "").trim();
  if (rawQ.length > 200) {
    res.status(400).json({ error: "Query parameter too long (max 200 characters)" });
    return;
  }
  const query = rawQ;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!query) {
    // No query — return airport shortcuts
    res.json({
      airports: SOUTH_FLORIDA_AIRPORTS,
      suggestions: [],
    });
    return;
  }

  // Check for airport shortcode match first
  const upperQuery = query.toUpperCase();
  const airportMatches = SOUTH_FLORIDA_AIRPORTS.filter(a =>
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
    url.searchParams.set("location", "26.0,-80.1");
    url.searchParams.set("radius", "160000"); // ~100 miles around South Florida
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
