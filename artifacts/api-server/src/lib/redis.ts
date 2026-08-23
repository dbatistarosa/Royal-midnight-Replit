import { Redis } from "@upstash/redis";

/**
 * Shared Redis client for the rate limiter (rateLimit.ts) and the
 * read-through cache (cache.ts).
 *
 * Backed by Upstash's REST API rather than a TCP client (ioredis and
 * friends) on purpose: a Vercel function gets a fresh process per cold
 * start, and a persistent TCP connection pool either leaks sockets or has to
 * reconnect on every invocation. REST has no connection to manage.
 *
 * Works with both Vercel's own KV product (Storage tab -> Upstash for
 * Redis, which sets KV_REST_API_URL/KV_REST_API_TOKEN) and a standalone
 * Upstash database (UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN) —
 * whichever pair is present wins. Returns null when neither is configured,
 * so every caller degrades to its pre-Redis behavior (in-memory rate
 * limiting, no caching) instead of throwing.
 */
let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (client !== undefined) return client;

  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    client = new Redis({ url, token });
  } else {
    client = null;
    console.warn(
      "[redis] KV_REST_API_URL/TOKEN (or UPSTASH_REDIS_REST_*) not set — rate limiting stays per-instance and cached reads fall through to the database on every request.",
    );
  }
  return client;
}
