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
 * Every authentication_failed, authorization_failed and cron_auth_failed this
 * codebase carefully logs went to stdout and nowhere else — no alert, no
 * aggregation, nobody watching. If someone probed the app there would be no
 * signal at all.
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
  console.error("[sentry] monitoring unavailable, continuing without it:", (err as Error)?.message);
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
    .map(o => o.trim())
    .filter(Boolean),
);

// Vercel Preview Deployments get a dynamic, per-deploy URL
// (royal-midnight-git-<branch>-<team>.vercel.app) that can't be listed in
// ALLOWED_ORIGINS ahead of time — scoped narrowly to this project's own
// preview URL pattern, not all of *.vercel.app, so other Vercel projects
// aren't accidentally allowed.
const PREVIEW_ORIGIN_PATTERN = /^https:\/\/royal-midnight-[a-z0-9-]+\.vercel\.app$/;

app.use(
  cors({
    origin(requestOrigin, callback) {
      // Allow server-to-server calls (no Origin header) and whitelisted origins only
      const isAllowedPreview = process.env.VERCEL_ENV === "preview"
        && !!requestOrigin
        && PREVIEW_ORIGIN_PATTERN.test(requestOrigin);
      if (!requestOrigin || ALLOWED_ORIGINS.has(requestOrigin) || isAllowedPreview) {
        callback(null, true);
      } else {
        callback(new Error(`Origin "${requestOrigin}" not allowed`));
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
if (process.env.NODE_ENV === "production") {
  const frontendDist = path.resolve(process.cwd(), "artifacts/royal-midnight/dist/public");
  if (existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.use((_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  } else {
    logger.warn({ frontendDist }, "Frontend dist not found — static serving skipped");
  }
}

// Reports unhandled route errors to Sentry before the generic handler below
// turns them into a flat 500. Must come after the routes.
if (sentry) {
  try {
    sentry.Sentry.setupExpressErrorHandler(app);
  } catch (err) {
    console.error("[sentry] express error handler not installed:", (err as Error)?.message);
  }
}

// Global error handler — logs unhandled route errors via pino, returns generic JSON
app.use((err: unknown, _req: import("express").Request, res: import("express").Response, _next: import("express").NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  const cause = (err as any)?.cause;
  const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : undefined;
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error({ err: { message, causeMsg, stack } }, "Unhandled route error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
