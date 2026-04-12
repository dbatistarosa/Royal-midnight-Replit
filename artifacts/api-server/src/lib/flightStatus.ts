/**
 * Flight status lookup via Aviationstack API.
 * Requires AVIATIONSTACK_API_KEY env var (free tier: 100 calls/month, HTTP only).
 * https://aviationstack.com/documentation
 */

const API_KEY = process.env.AVIATIONSTACK_API_KEY;
// Free tier uses HTTP; paid tier supports HTTPS
const BASE_URL = "http://api.aviationstack.com/v1";

export type FlightStatus = {
  flightNumber: string;
  airline: string;
  status: "scheduled" | "active" | "landed" | "cancelled" | "incident" | "diverted" | "unknown";
  departure: {
    airport: string;
    iata: string;
    scheduled: string | null;
    estimated: string | null;
    actual: string | null;
  };
  arrival: {
    airport: string;
    iata: string;
    scheduled: string | null;
    estimated: string | null;
    actual: string | null;
    terminal: string | null;
    gate: string | null;
  };
  delayMinutes: number | null;
};

export function isFlightStatusConfigured(): boolean {
  return !!API_KEY;
}

/**
 * Look up the current status of a flight by IATA code (e.g. "AA123", "UA456").
 * Returns null if the API key is not configured, the flight is not found,
 * or the request fails.
 */
export async function getFlightStatus(flightIata: string): Promise<FlightStatus | null> {
  if (!API_KEY) return null;

  // Normalise: remove spaces, uppercase
  const fl = flightIata.replace(/\s+/g, "").toUpperCase();
  if (!fl) return null;

  try {
    const url = `${BASE_URL}/flights?access_key=${API_KEY}&flight_iata=${encodeURIComponent(fl)}&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.warn(`[flightStatus] Aviationstack returned ${res.status} for ${fl}`);
      return null;
    }

    const json = await res.json() as {
      data?: Array<Record<string, any>>;
      error?: { message: string };
    };

    if (json.error) {
      console.warn(`[flightStatus] API error for ${fl}:`, json.error.message);
      return null;
    }

    const data = json.data?.[0];
    if (!data) return null;

    const rawStatus = String(data.flight_status ?? "unknown").toLowerCase();
    const knownStatuses = ["scheduled", "active", "landed", "cancelled", "incident", "diverted"];
    const status = knownStatuses.includes(rawStatus)
      ? (rawStatus as FlightStatus["status"])
      : "unknown";

    return {
      flightNumber: data.flight?.iata ?? fl,
      airline: data.airline?.name ?? "",
      status,
      departure: {
        airport: data.departure?.airport ?? "",
        iata: data.departure?.iata ?? "",
        scheduled: data.departure?.scheduled ?? null,
        estimated: data.departure?.estimated ?? null,
        actual: data.departure?.actual ?? null,
      },
      arrival: {
        airport: data.arrival?.airport ?? "",
        iata: data.arrival?.iata ?? "",
        scheduled: data.arrival?.scheduled ?? null,
        estimated: data.arrival?.estimated ?? null,
        actual: data.arrival?.actual ?? null,
        terminal: data.arrival?.terminal ?? null,
        gate: data.arrival?.gate ?? null,
      },
      delayMinutes: typeof data.arrival?.delay === "number" ? data.arrival.delay : null,
    };
  } catch (err: any) {
    console.error(`[flightStatus] Request failed for ${fl}:`, err.message);
    return null;
  }
}
