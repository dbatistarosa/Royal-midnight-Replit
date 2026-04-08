import { eq, and, isNull } from "drizzle-orm";
import { db, usersTable, settingsTable, bookingsTable } from "@workspace/db";
import Stripe from "stripe";
import app from "./app";
import { logger } from "./lib/logger";
import { hashPassword, isValidHash } from "./lib/hash.js";

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
  if (!stripeKey) {
    logger.warn("STRIPE_SECRET_KEY not set — skipping webhook check");
    return;
  }

  // Default to production URL when APP_URL is not explicitly set
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const expectedUrl = `${appUrl}/api/webhook/stripe`;

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" as const });
    const existing = await stripe.webhookEndpoints.list({ limit: 20 });
    const found = existing.data.find(w => w.url === expectedUrl && w.status === "enabled");

    const REQUIRED_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
      "payment_intent.succeeded",
      "payment_intent.payment_failed",
      "charge.dispute.created",
      "charge.refunded",
      "invoice.paid",
    ];

    if (found) {
      const currentEvents = found.enabled_events ?? [];
      const missingEvents = REQUIRED_EVENTS.filter(e => !currentEvents.includes(e));
      if (missingEvents.length > 0) {
        await stripe.webhookEndpoints.update(found.id, {
          enabled_events: REQUIRED_EVENTS,
        });
        logger.info({ webhookId: found.id, added: missingEvents }, "Stripe webhook updated with new events");
      } else {
        logger.info({ webhookId: found.id, url: expectedUrl }, "Stripe webhook already registered");
      }
      return;
    }

    const webhook = await stripe.webhookEndpoints.create({
      url: expectedUrl,
      enabled_events: REQUIRED_EVENTS,
      description: "Royal Midnight payment confirmation webhook",
    });

    // Persist signing secret to DB so webhook handler can use it without env var
    if (webhook.secret) {
      await db
        .insert(settingsTable)
        .values({ key: "stripe_webhook_secret", value: webhook.secret })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value: webhook.secret } });
      logger.info({ webhookId: webhook.id, url: expectedUrl }, "Stripe webhook auto-registered — signing secret saved to DB. Set STRIPE_WEBHOOK_SECRET in env for best security.");
    }
  } catch (err) {
    logger.error({ err }, "Stripe webhook ensure failed (non-fatal)");
  }
}

// Link all unlinked bookings (userId IS NULL) to matching user accounts by passengerEmail.
// Runs once at startup so historical admin-created bookings are retroactively associated.
async function retroactiveEmailLink(): Promise<void> {
  try {
    const users = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable);
    let linked = 0;
    for (const user of users) {
      const result = await db
        .update(bookingsTable)
        .set({ userId: user.id })
        .where(and(eq(bookingsTable.passengerEmail, user.email), isNull(bookingsTable.userId)))
        .returning({ id: bookingsTable.id });
      linked += result.length;
    }
    if (linked > 0) {
      logger.info({ linked }, "Retroactive email link: linked unlinked bookings to user accounts");
    }
  } catch (err) {
    logger.error({ err }, "Retroactive email link failed (non-fatal)");
  }
}

seedDatabase()
  .then(() => retroactiveEmailLink())
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
