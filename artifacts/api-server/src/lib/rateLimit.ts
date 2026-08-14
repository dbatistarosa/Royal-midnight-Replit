import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";

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
 * Known limitation, deliberately accepted for now: the default MemoryStore is
 * per-instance, and Vercel runs many. The effective limit is therefore
 * (limit x live instances). That still turns "unbounded" into "bounded", which
 * is the whole point at this traffic level. A shared store (Vercel KV /
 * Upstash) is the follow-up, and is the same work that moves the OTP store out
 * of memory.
 */

const shared = { standardHeaders: true as const, legacyHeaders: false as const };

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
    windowMs: 60 * 1000,
    limit: 240,
    skip: req =>
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
    windowMs: 60 * 1000,
    limit: 30,
    message: { error: "Too many quote requests. Please wait a moment." },
  });
}

/** Promo codes are short and guessable, and validating one costs the attacker
 *  nothing. This is the only thing standing between the codes and enumeration. */
export function promoLimiter(): RateLimitRequestHandler {
  return rateLimit({
    ...shared,
    windowMs: 15 * 60 * 1000,
    limit: 20,
    message: { error: "Too many promo code attempts. Please try again later." },
  });
}
