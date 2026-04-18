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

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? "https://royalmidnight.com")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean),
);

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
