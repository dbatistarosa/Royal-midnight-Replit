import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

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

function parseAllowedOrigins(): Set<string> {
  const raw = (process.env.ALLOWED_ORIGINS ?? "https://royalmidnight.com")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean);

  const validated = raw.filter(origin => {
    try {
      const url = new URL(origin);
      if (url.protocol !== "https:" && !origin.startsWith("http://localhost")) {
        logger.warn({ origin }, "CORS: rejected non-HTTPS origin");
        return false;
      }
      if (origin.includes("*")) {
        logger.warn({ origin }, "CORS: rejected wildcard origin");
        return false;
      }
      return true;
    } catch {
      logger.warn({ origin }, "CORS: rejected malformed origin");
      return false;
    }
  });

  if (validated.length === 0) {
    throw new Error("No valid ALLOWED_ORIGINS configured. At least one HTTPS origin is required.");
  }
  return new Set(validated);
}

const ALLOWED_ORIGINS = parseAllowedOrigins();

app.use(
  cors({
    origin(requestOrigin, callback) {
      // Allow server-to-server calls (no Origin header) and whitelisted origins only
      if (!requestOrigin || ALLOWED_ORIGINS.has(requestOrigin)) {
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

export default app;
