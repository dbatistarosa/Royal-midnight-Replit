/**
 * Lightweight in-memory TTL cache for server-side data that changes rarely
 * (settings, pricing rules, geo zones, geocoding results, etc.).
 *
 * Usage:
 *   const cache = new ServerCache<string, MyType>(5 * 60_000); // 5-min TTL
 *   cache.set("key", value);
 *   cache.get("key"); // returns value or undefined if expired/missing
 *   cache.invalidate("key");
 *   cache.clear(); // wipe everything (use on broad config changes)
 */
export class ServerCache<K, V> {
  private store = new Map<K, { value: V; expiresAt: number }>();

  constructor(private defaultTtlMs: number) {}

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V, ttlMs = this.defaultTtlMs): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidate(key: K): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /** Convenience: return cached value or compute + cache it. */
  async getOrSet(key: K, fn: () => Promise<V>, ttlMs = this.defaultTtlMs): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await fn();
    this.set(key, value, ttlMs);
    return value;
  }
}

// ── Shared singleton caches ───────────────────────────────────────────────────

/** Settings rows — invalidate on PATCH /settings */
export const settingsCache = new ServerCache<string, string>(30 * 60_000);

/** Pricing rules — invalidate on pricing update */
export const pricingCache = new ServerCache<string, { baseFare: number; ratePerMile: number; airportFee: number }>(60 * 60_000);

/** Active geo zones (full list) — invalidate on zone create/update/delete */
export const geoZonesCache = new ServerCache<"all", unknown[]>(5 * 60_000);

/** Geocoding results: address → {lat, lng} */
export const geocodeCache = new ServerCache<string, { lat: number; lng: number } | null>(24 * 60 * 60_000);

/** Directions results: "origin|dest|wp1|wp2" → {distance, duration} */
export const directionsCache = new ServerCache<string, { distance: number; duration: number } | null>(24 * 60 * 60_000);

/** Flight status: flight IATA → FlightStatus | null */
export const flightStatusCache = new ServerCache<string, unknown>(6 * 60 * 60_000);

/** Google Places autocomplete: "query:mode" → prediction array */
export const autocompleteCache = new ServerCache<string, unknown[]>(5 * 60_000);
