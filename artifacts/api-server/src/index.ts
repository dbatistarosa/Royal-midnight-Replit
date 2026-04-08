import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import Stripe from "stripe";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "royal_midnight_salt").digest("hex");
}

function isValidHash(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

async function seedDatabase(): Promise<void> {
  try {
    const adminEmail = "admin@royalmidnight.com";
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, adminEmail));

    if (!existing) {
      await db.insert(usersTable).values({
        name: "Royal Midnight Admin",
        email: adminEmail,
        phone: null,
        role: "admin",
        passwordHash: hashPassword("admin2024!"),
      });
      logger.info("Admin user seeded successfully");
    } else {
      logger.info("Admin user already exists — skipping seed");
    }

    const allUsers = await db.select().from(usersTable);
    for (const user of allUsers) {
      if (user.passwordHash && !isValidHash(user.passwordHash)) {
        const fixedHash = hashPassword(user.passwordHash);
        await db
          .update(usersTable)
          .set({ passwordHash: fixedHash })
          .where(eq(usersTable.id, user.id));
        logger.info({ email: user.email }, "Fixed corrupted password hash");
      }
    }
  } catch (err) {
    logger.error({ err }, "Database seed failed");
  }
}

async function ensureStripeWebhook(): Promise<void> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const appUrl = process.env.APP_URL;
  if (!stripeKey || !appUrl) {
    if (!stripeKey) logger.warn("STRIPE_SECRET_KEY not set — skipping webhook check");
    if (!appUrl) logger.warn("APP_URL not set — skipping webhook check");
    return;
  }

  const expectedUrl = `${appUrl}/api/webhook/stripe`;

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" as any });
    const existing = await stripe.webhookEndpoints.list({ limit: 20 });
    const found = existing.data.find(w => w.url === expectedUrl && w.status === "enabled");

    if (found) {
      logger.info({ webhookId: found.id, url: expectedUrl }, "Stripe webhook already registered");
      return;
    }

    const webhook = await stripe.webhookEndpoints.create({
      url: expectedUrl,
      enabled_events: ["payment_intent.succeeded", "invoice.payment_succeeded"],
      description: "Royal Midnight payment confirmation webhook",
    });

    logger.info({ webhookId: webhook.id, url: expectedUrl }, "Stripe webhook auto-registered — set STRIPE_WEBHOOK_SECRET in env vars");
    logger.info(`Signing secret (set as STRIPE_WEBHOOK_SECRET): ${webhook.secret}`);
  } catch (err) {
    logger.error({ err }, "Stripe webhook ensure failed (non-fatal)");
  }
}

seedDatabase()
  .then(() => ensureStripeWebhook())
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
    });
  });
