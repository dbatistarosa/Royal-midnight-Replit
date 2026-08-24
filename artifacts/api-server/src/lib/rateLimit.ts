import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from "express-rate-limit";
import { getRedis } from "./redis.js";
import { RedisRateLimitStore } from "./redisRateLimitStore.js";

/**
 * Rate limiting beyond /auth/*.
 *
 * express-rate-limit was already installed and correctly applied, but only to
 * the seven auth handlers. Everything else was open, including the two
 * endpoints that spend money on every call: /autocomplete geocodes with our
 * Mapbox token, and /quote geocodes *and* asks for directions. Neither is a
 * data-disclosure problem — it is a bill, and a denial-of-service one, since
 * exhausting the Mapbox quota degrades quoting for real customers.
 *
 * Each limiter's store used to be the default MemoryStore, which is
 * per-instance — Vercel runs many, so the effective limit was (limit x live
 * instances). storeFor() swaps in a shared Redis-backed store the moment
 * KV_REST_API_URL/TOKEN (or UPSTASH_REDIS_REST_*) is set; until then it
 * returns undefined and express-rate-limit falls back to MemoryStore exactly
 * as before, so this is safe to deploy ahead of provisioning Redis.
 *
 * Exported: auth.ts's credentialLimiter/otpLimiter are defined locally (they
 * predate this file) but need the exact same store — a login/registration
 * limiter that resets per Vercel instance is the same bug as everything else
 * here, just on the endpoints that matter most for brute-forcing.
 */
export function storeFor(prefix: string): RedisRateLimitStore | undefined {
  return getRedis() ? new RedisRateLimitStore(prefix) : undefined;
}

const shared = {
  standardHeaders: true as const,
  legacyHeaders: false as const,
  // A Redis hiccup should cost latency, not turn "rate limited" into "site
  // down" — let the request through and rely on Stripe Radar / DB constraints
  // as the backstop for whatever this limiter was guarding.
  passOnStoreError: true as const,
};

/**
 * Baseline for the whole API. Generous enough that a normal page load — which
 * fans out to several endpoints — never notices, low enough to stop a scraper.
 *
 * Skips the Stripe webhook and the cron endpoints: both authenticate on their
 * own (signature, shared secret), both are called from a small set of provider
 * IPs, and throttling either would silently drop payment events or stop payouts
 * and trip reminders from running.
 */
export function globalLimiter(): RateLimitRequestHandler {
  return rateLimit({
    ...shared,
    store: storeFor("global"),
    windowMs: 60 * 1000,
    limit: 240,
    skip: (req) =>
      req.originalUrl.startsWith("/api/webhook/") ||
      req.originalUrl.startsWith("/api/cron/"),
    message: { error: "Too many requests. Please slow down." },
  });
}

/**
 * Endpoints that call Mapbox on our account.
 *
 * Sized for the booking form rather than for a single request: the address
 * fields debounce at 250 ms, and a booking has a pickup, a dropoff and possibly
 * several waypoints, so one person filling in a form legitimately produces
 * dozens of calls a minute. Shared-NAT callers (a hotel front desk, an office)
 * share this bucket, which is why it is not tighter.
 */
export function mapsLimiter(): RateLimitRequestHandler {
  return rateLimit({
    ...shared,
    store: storeFor("maps"),
    windowMs: 60 * 1000,
    limit: 60,
    message: { error: "Too many address lookups. Please wait a moment." },
  });
}

/** Quotes are heavier than autocomplete — geocoding plus directions — and are
 *  requested once per pricing refresh rather than per keystroke. */
export function quoteLimiter(): RateLimitRequestHandler {
  return rateLimit({
    ...shared,
    store: storeFor("quote"),
    windowMs: 60 * 1000,
    limit: 30,
    message: { error: "Too many quote requests. Please wait a moment." },
  });
}

/** POST /bookings runs the exact same computeQuote() as /quote internally
 *  (geocoding + Directions) on top of a database write, and — unlike /quote —
 *  is reachable without an account. It fell back to globalLimiter() alone
 *  (240/min across all of /api), so an anonymous caller could drive up to
 *  240 Mapbox-billed writes a minute through this one route. */
export function bookingLimiter(): RateLimitRequestHandler {
  return rateLimit({
    ...shared,
    store: storeFor("booking"),
    windowMs: 60 * 1000,
    limit: 20,
    message: { error: "Too many booking attempts. Please wait a moment." },
  });
}

/** Promo codes are short and guessable, and validating one costs the attacker
 *  nothing. This is the only thing standing between the codes and enumeration. */
export function promoLimiter(): RateLimitRequestHandler {
  return rateLimit({
    ...shared,
    store: storeFor("promo"),
    windowMs: 15 * 60 * 1000,
    limit: 20,
    message: { error: "Too many promo code attempts. Please try again later." },
  });
}

/** Pre-registration document uploads (driver onboarding, before an account
 *  exists — see storage.ts's /storage/registration-uploads/request-url). This
 *  is the one upload endpoint reachable without a session, so unlike the rest
 *  of storage.ts it needs its own throttle rather than relying on requireAuth
 *  plus the global limiter. A real applicant uploads at most 4 files in one
 *  sitting; this leaves room for retries on a bad connection without leaving
 *  the endpoint open to scripted abuse of Supabase's signed-URL calls. */
export function registrationUploadLimiter(): RateLimitRequestHandler {
  return rateLimit({
    ...shared,
    store: storeFor("registration-upload"),
    windowMs: 15 * 60 * 1000,
    limit: 20,
    message: { error: "Too many upload attempts. Please wait a few minutes and try again." },
  });
}

/** Stripe-facing payment endpoints (create-intent, tips, saved cards). Every
 *  other sensitive endpoint (auth, OTP, quote, promo) already has a limiter;
 *  these fell back to globalLimiter() alone, and create-intent is reachable
 *  with only optionalAuth. Keyed by session where available so a shared-NAT
 *  caller doesn't throttle out other guests, falling back to IP for
 *  unauthenticated callers. Defense-in-depth alongside Stripe Radar, not a
 *  replacement for it. */
export function paymentLimiter(): RateLimitRequestHandler {
  return rateLimit({
    ...shared,
    store: storeFor("payment"),
    windowMs: 15 * 60 * 1000,
    limit: 20,
    // ipKeyGenerator(), not req.ip directly: express-rate-limit validates this
    // at startup and logs ERR_ERL_KEY_GEN_IPV6 otherwise — a raw IPv6 address
    // is per-connection, not per-client, so keying on it verbatim lets an
    // unauthenticated caller rotate through addresses in their own /64 and
    // never hit the limit. The helper normalizes to the standard /56 subnet.
    keyGenerator: (req) =>
      req.currentUser?.userId?.toString() ?? ipKeyGenerator(req.ip ?? "unknown"),
    message: {
      error: "Too many payment requests. Please wait a moment and try again.",
    },
  });
}
