import type { Store, ClientRateLimitInfo, Options } from "express-rate-limit";
import { getRedis } from "./redis.js";

// INCR then, only on the first hit in this window, PEXPIRE — one round trip,
// atomic, so two requests landing at the same instant can't both see "first
// hit" and leave the key without a TTL. Returns [count, ttlMs] together so a
// second round trip isn't needed to compute resetTime.
const INCR_AND_EXPIRE = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return {current, ttl}
`;

/**
 * express-rate-limit's default MemoryStore is per-process. Vercel runs many
 * processes for the same function, so today's real limit is (configured
 * limit x live instances) — documented and accepted at current traffic in
 * rateLimit.ts. This store makes the limit exact once Redis is configured.
 *
 * Fixed-window counter (INCR + PEXPIRE on first hit) — the same algorithm
 * MemoryStore itself uses, just backed by a store every instance shares.
 * Each limiter gets its own instance with a distinct prefix so "global",
 * "maps", "quote" etc. never collide on the same client key.
 */
export class RedisRateLimitStore implements Store {
  // Public on purpose: express-rate-limit's own anti-double-count guard
  // (checks.singleCount) reads store.prefix specifically to tell apart two
  // instances of the same store class that happen to see the same client key
  // in one request — exactly our situation, since every route passes through
  // globalLimiter() plus its own route-specific limiter, both backed by this
  // class. Without a public prefix here, every instance looked identical to
  // that guard, so the second limiter's increment() on a shared key (usually
  // the caller's IP) was flagged as a duplicate and thrown as
  // ERR_ERL_DOUBLE_COUNT, which Express turned into a flat 500 on login,
  // register, quote, booking, autocomplete and promo-validate the moment
  // Redis went live. A prior version of this class named the field
  // `keyPrefix` specifically to dodge that check by staying private — that
  // avoided a TS conflict but silently defeated the exact protection the
  // library provides.
  readonly prefix: string;
  private windowMs = 60_000;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private key(key: string): string {
    return `rl:${this.prefix}:${key}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const redis = getRedis();
    if (!redis) {
      // rateLimit.ts only wires this store up when getRedis() is non-null at
      // setup time; a null client here means Redis died mid-request. Fail
      // open rather than block traffic on a rate limiter's own outage.
      return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
    }
    const [current, ttlMs] = await redis.eval<[string], [number, number]>(
      INCR_AND_EXPIRE,
      [this.key(key)],
      [this.windowMs.toString()],
    );
    return {
      totalHits: current,
      resetTime: new Date(Date.now() + (ttlMs > 0 ? ttlMs : this.windowMs)),
    };
  }

  async decrement(key: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;
    await redis.decr(this.key(key));
  }

  async resetKey(key: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;
    await redis.del(this.key(key));
  }
}
