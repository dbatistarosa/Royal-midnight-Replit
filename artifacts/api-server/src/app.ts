import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path from "path";
import { existsSync } from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { globalLimiter } from "./lib/rateLimit";

/**
 * Error monitoring.
 *
 * authorization_failed (middleware/auth.ts) and cron_auth_failed (routes/cron.ts)
 * now also fire a best-effort Sentry captureMessage alongside the stdout log
 * (lib/sentry.ts's captureSecurityEvent), each via its own dynamic import so a
 * missing/broken Sentry setup can never affect the request being reported on.
 * authentication_required / invalid_or_expired_session (routine 401s — expired
 * sessions, logged-out tabs) are deliberately left stdout-only: alerting on
 * every one would be noise, not signal.
 *
 * Loaded through a guarded dynamic import rather than a static one, and that is
 * not superstition: importing @sentry/node at the top of this file took the
 * entire API down once (FUNCTION_INVOCATION_FAILED on every endpoint, fixed in
 * 18e4a99 by ripping the import back out). The root cause is fixed properly in
 * build.mjs — @opentelemetry/* is now bundled instead of externalised — but the
 * blast radius of being wrong here is the whole site, so a failure to load
 * monitoring must never be able to stop the app from booting. Worst case,
 * Sentry is off and the reason is in the logs.
 *
 * Trade-off accepted: static imports are hoisted above top-level await, so
 * Sentry initialises after express is loaded and its auto-instrumentation of
 * http is incomplete. Error capture, which is the point here, is unaffected.
 */
let sentry: typeof import("./lib/sentry.js") | null = null;
try {
  sentry = await import("./lib/sentry.js");
  sentry.initSentry();
} catch (err) {
  sentry = null;
  console.error(
    "[sentry] monitoring unavailable, continuing without it:",
    (err as Error)?.message,
  );
}

const app: Express = express();

// Vercel (and any reverse proxy) sets X-Forwarded-For — trust one hop so
// express-rate-limit can identify callers correctly.
app.set("trust proxy", 1);

// Security headers — must be first so every response gets them
app.use(
  helmet({
    // API serves JSON, not HTML — skip HTML-specific headers
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    // Frontend is on a different origin; allow it to read API responses
    crossOriginResourcePolicy: { policy: "cross-origin" },
    strictTransportSecurity: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? "https://royalmidnight.com")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);

// Vercel Preview Deployments get a dynamic, per-deploy URL
// (royal-midnight-git-<branch>-<team>.vercel.app) that can't be listed in
// ALLOWED_ORIGINS ahead of time — scoped narrowly to this project's own
// preview URL pattern, not all of *.vercel.app, so other Vercel projects
// aren't accidentally allowed.
const PREVIEW_ORIGIN_PATTERN =
  /^https:\/\/royal-midnight-[a-z0-9-]+\.vercel\.app$/;

app.use(
  cors({
    origin(requestOrigin, callback) {
      // Allow server-to-server calls (no Origin header) and whitelisted origins only
      const isAllowedPreview =
        process.env.VERCEL_ENV === "preview" &&
        !!requestOrigin &&
        PREVIEW_ORIGIN_PATTERN.test(requestOrigin);
      if (
        !requestOrigin ||
        ALLOWED_ORIGINS.has(requestOrigin) ||
        isAllowedPreview
      ) {
        callback(null, true);
      } else {
        // Reporting an Error here (the previous behaviour) makes the `cors`
        // package call next(err), which falls through past every route to the
        // generic handler at the bottom of this file and answers with a flat
        // 500 "Internal server error" — indistinguishable, from the browser,
        // from a real server fault. That confusing 500 on login/register/
        // booking is exactly what's happened each time a domain or subdomain
        // variant wasn't yet in ALLOWED_ORIGINS. Passing `false` instead tells
        // `cors` to just omit the Access-Control-Allow-Origin header and move
        // on — the browser's own same-origin policy then blocks the response
        // from being read, with no server-side error at all.
        logger.warn({ origin: requestOrigin }, "cors_origin_rejected");
        callback(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Stripe webhook requires raw body for signature verification — must come before express.json()
app.use("/api/webhook/stripe", express.raw({ type: "application/json" }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Reads the HttpOnly session cookie the web app authenticates with (CN-014).
// The package was already a dependency but had never been mounted.
app.use(cookieParser());

// Baseline throttle for the whole API. Rate limiting previously covered only
// /auth/*, leaving the Mapbox-backed endpoints — which cost real money per
// call — completely open. Mounted before the router so it also covers 404s.
app.use("/api", globalLimiter());

app.use("/api", router);

// In production, serve the Vite frontend build as static files and handle SPA routing.
//
// This branch only runs on a non-Vercel host (e.g. Railway, per railway.json) —
// on Vercel the frontend is served by Vercel's own static hosting and these
// responses never reach Express. The full header set below mirrors vercel.json
// so security posture doesn't depend on which host is actually serving traffic.
if (process.env.NODE_ENV === "production") {
  const frontendDist = path.resolve(
    process.cwd(),
    "artifacts/royal-midnight/dist/public",
  );
  if (existsSync(frontendDist)) {
    app.use((_req, res, next) => {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' https://js.stripe.com https://m.stripe.network; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; " +
          "worker-src 'self' blob:; child-src 'self' blob:; " +
          "connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://api.stripe.com " +
          "https://maps.stripe.com https://merchant-ui-api.stripe.com https://m.stripe.network " +
          "https://r.stripe.com https://q.stripe.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io; " +
          "frame-src https://js.stripe.com https://hooks.stripe.com https://m.stripe.network; " +
          "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
      );
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader(
        "Permissions-Policy",
        'camera=(), microphone=(), payment=(self "https://js.stripe.com"), geolocation=(self)',
      );
      next();
    });
    app.use(express.static(frontendDist));
    app.use((_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  } else {
    logger.warn(
      { frontendDist },
      "Frontend dist not found — static serving skipped",
    );
  }
}

// Reports unhandled route errors to Sentry before the generic handler below
// turns them into a flat 500. Must come after the routes.
if (sentry) {
  try {
    sentry.Sentry.setupExpressErrorHandler(app);
  } catch (err) {
    console.error(
      "[sentry] express error handler not installed:",
      (err as Error)?.message,
    );
  }
}

// Global error handler — logs unhandled route errors via pino, returns generic JSON
app.use(
  (
    err: unknown,
    _req: import("express").Request,
    res: import("express").Response,
    _next: import("express").NextFunction,
  ) => {
    const message = err instanceof Error ? err.message : String(err);
    const cause = (err as any)?.cause;
    const causeMsg =
      cause instanceof Error
        ? cause.message
        : cause
          ? String(cause)
          : undefined;
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error(
      { err: { message, causeMsg, stack } },
      "Unhandled route error",
    );
    res.status(500).json({ error: "Internal server error" });
  },
);

export default app;
