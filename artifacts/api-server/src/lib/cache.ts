import { getRedis } from "./redis.js";

/**
 * Read-through cache for data that is identical for every caller — pricing
 * rules, the vehicle catalog, public settings, Mapbox geocoding results —
 * and either expensive to compute or billed per call, but currently
 * re-fetched from the database (or from Mapbox) on every single request.
 *
 * Correctness never depends on this cache being present: with Redis
 * unconfigured, getOrSetCache always calls fetcher and behaves exactly like
 * the code before this existed. A Redis read/write failure logs and falls
 * through the same way, so a Redis outage degrades latency, never breaks a
 * response.
 */
export async function getOrSetCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  if (!redis) return fetcher();

  try {
    const cached = await redis.get<T>(key);
    if (cached !== null && cached !== undefined) return cached;
  } catch (err) {
    console.error("[cache] read failed, falling through to source:", (err as Error)?.message);
  }

  const fresh = await fetcher();
  try {
    await redis.set(key, fresh, { ex: ttlSeconds });
  } catch (err) {
    console.error("[cache] write failed, response is still correct:", (err as Error)?.message);
  }
  return fresh;
}

/** Call after an admin write to something cached above so readers stop
 *  seeing the stale value immediately instead of waiting out the TTL. */
export async function invalidateCache(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (err) {
    console.error("[cache] invalidation failed, will self-heal at TTL:", (err as Error)?.message);
  }
}
