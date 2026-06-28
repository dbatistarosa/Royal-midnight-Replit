import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path from "path";
import { existsSync } from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { initSentry, Sentry } from "./lib/sentry";

// Must run before the app/middleware are built so Sentry's auto-instrumentation
// can wrap them.
initSentry();

const app: Express = express();

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

// Reports unhandled route errors to Sentry (no-ops if SENTRY_DSN is unset) —
// must come before the generic error handler below so it sees the error first.
Sentry.setupExpressErrorHandler(app);

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
