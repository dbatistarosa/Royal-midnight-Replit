import { Router, type IRouter } from "express";
import Stripe from "stripe";
import { db } from "@workspace/db";
import { bookingsTable as bookings, driversTable, settingsTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  sendBookingConfirmationPassenger,
  sendNewBookingAdmin,
  sendNewBookingAvailableToDrivers,
  getMailerStatus,
} from "../lib/mailer.js";
import { requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

const APP_URL = process.env.APP_URL ?? "https://royalmidnight.com";
const WEBHOOK_URL = `${APP_URL}/api/webhook/stripe`;

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2024-06-20" as const });
}

async function getWebhookSecret(): Promise<string | null> {
  // Prefer explicit env var (most secure)
  if (process.env.STRIPE_WEBHOOK_SECRET) return process.env.STRIPE_WEBHOOK_SECRET;
  // Fall back to DB-persisted secret (set during auto-registration)
  const [row] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "stripe_webhook_secret"))
    .limit(1);
  return row?.value ?? null;
}

async function getCommissionPct(): Promise<number> {
  const [row] = await db.select({ value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, "commission_pct")).limit(1);
  const raw = parseFloat(row?.value ?? "30");
  return raw > 1 ? raw / 100 : raw;
}

async function firePostPaymentEmails(bookingId: number): Promise<void> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!booking) return;

  const commissionPct = await getCommissionPct();
  const priceQuoted = parseFloat(String(booking.priceQuoted));
  const emailData = {
    id: booking.id,
    passengerName: booking.passengerName,
    passengerEmail: booking.passengerEmail,
    pickupAddress: booking.pickupAddress,
    dropoffAddress: booking.dropoffAddress,
    pickupAt: booking.pickupAt.toISOString(),
    vehicleClass: booking.vehicleClass ?? "business",
    passengers: booking.passengers ?? 1,
    priceQuoted,
    driverEarnings: Math.round(priceQuoted * commissionPct * 100) / 100,
    flightNumber: booking.flightNumber ?? null,
    specialRequests: booking.specialRequests ?? null,
  };

  const approvedDrivers = await db
    .select({ email: usersTable.email })
    .from(driversTable)
    .innerJoin(usersTable, eq(driversTable.userId, usersTable.id))
    .where(eq(driversTable.approvalStatus, "approved"));
  const driverEmails = approvedDrivers.map(d => d.email).filter(Boolean) as string[];

  await Promise.all([
    sendBookingConfirmationPassenger(emailData),
    sendNewBookingAdmin(emailData),
    sendNewBookingAvailableToDrivers(emailData, driverEmails),
  ]);
}

// ─── Public endpoints ───────────────────────────────────────────────────────

router.get("/payments/config", async (_req, res): Promise<void> => {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    res.status(503).json({ error: "Stripe not configured" });
    return;
  }
  res.json({ publishableKey });
});

router.post("/payments/create-intent", async (req, res): Promise<void> => {
  const { bookingId, amount } = req.body as { bookingId?: number; amount: number };
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "amount is required" });
    return;
  }
  try {
    const stripe = getStripe();
    let metadata: Record<string, string> = {};
    let description = "Royal Midnight — Reservation";

    if (bookingId) {
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
      if (booking) {
        metadata = {
          bookingId: String(bookingId),
          passengerName: booking.passengerName,
          pickupAddress: booking.pickupAddress,
          dropoffAddress: booking.dropoffAddress,
        };
        description = `Royal Midnight — Booking #RM-${String(bookingId).padStart(4, "0")}`;
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata,
      description,
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/payments/confirm/:bookingId", async (req, res): Promise<void> => {
  const { bookingId } = req.params;
  const { paymentIntentId } = req.body as { paymentIntentId: string };
  const bId = parseInt(bookingId ?? "", 10);
  if (!bId || !paymentIntentId) {
    res.status(400).json({ error: "bookingId and paymentIntentId required" });
    return;
  }
  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Enforce PI-to-booking binding: metadata.bookingId must match the requested bookingId
    if (intent.metadata.bookingId !== String(bId)) {
      res.status(403).json({ error: "PaymentIntent does not belong to this booking" });
      return;
    }

    if (intent.status === "succeeded") {
      const [current] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, bId));
      if (current && current.status === "awaiting_payment") {
        await db.update(bookings)
          .set({ status: "pending", updatedAt: new Date() })
          .where(eq(bookings.id, bId));
        firePostPaymentEmails(bId).catch(err => console.error("[payments] post-confirm email error:", err));
      }
      res.json({ success: true, status: "pending" });
    } else {
      res.status(400).json({ error: "Payment not completed", status: intent.status });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: manual payment confirmation for stuck awaiting_payment bookings ──

router.post("/admin/payments/check/:bookingId", requireAdmin, async (req, res): Promise<void> => {
  const bId = parseInt(req.params["bookingId"] ?? "", 10);
  if (!bId) { res.status(400).json({ error: "Invalid booking id" }); return; }

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bId));
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

  try {
    const stripe = getStripe();
    const intents = await stripe.paymentIntents.search({
      query: `metadata["bookingId"]:"${bId}"`,
      limit: 5,
    });

    const succeeded = intents.data.find(pi => pi.status === "succeeded");
    if (succeeded) {
      if (booking.status === "awaiting_payment") {
        await db.update(bookings)
          .set({ status: "pending", updatedAt: new Date() })
          .where(eq(bookings.id, bId));
        firePostPaymentEmails(bId).catch(() => {});
        res.json({ confirmed: true, paymentIntentId: succeeded.id, message: "Payment confirmed — booking moved to pending." });
      } else {
        res.json({ confirmed: false, message: `Booking is already in '${booking.status}' status.` });
      }
    } else {
      const statuses = intents.data.map(pi => pi.status).join(", ") || "none found";
      res.json({ confirmed: false, message: `No succeeded payment intent found. Found: ${statuses}` });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: Stripe webhook management ───────────────────────────────────────

router.get("/admin/stripe/webhook-status", requireAdmin, async (_req, res): Promise<void> => {
  const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
  const webhookSecretInEnv = !!process.env.STRIPE_WEBHOOK_SECRET;
  const mailerStatus = getMailerStatus();

  // Check DB fallback for webhook secret
  const dbSecret = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "stripe_webhook_secret"))
    .limit(1)
    .then(rows => rows[0]?.value ?? null);

  const webhookSecretSet = webhookSecretInEnv || !!dbSecret;
  const webhookSecretSource = webhookSecretInEnv ? "env" : (dbSecret ? "db" : "none");

  if (!stripeConfigured) {
    res.json({
      stripeConfigured: false,
      webhookSecretSet: false,
      webhookSecretSource,
      webhooks: [],
      expectedUrl: WEBHOOK_URL,
      mailer: mailerStatus,
    });
    return;
  }

  try {
    const stripe = getStripe();
    const webhookList = await stripe.webhookEndpoints.list({ limit: 20 });
    const webhooks = webhookList.data.map(w => ({
      id: w.id,
      url: w.url,
      status: w.status,
      enabledEvents: w.enabled_events,
      isOurs: w.url === WEBHOOK_URL,
    }));
    const isRegistered = webhooks.some(w => w.isOurs && w.status === "enabled");
    res.json({
      stripeConfigured: true,
      webhookSecretSet,
      webhookSecretSource,
      webhooks,
      expectedUrl: WEBHOOK_URL,
      isRegistered,
      mailer: mailerStatus,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/admin/stripe/register-webhook", requireAdmin, async (_req, res): Promise<void> => {
  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(503).json({ error: "STRIPE_SECRET_KEY is not configured" });
    return;
  }
  try {
    const stripe = getStripe();

    const existing = await stripe.webhookEndpoints.list({ limit: 20 });
    const alreadyExists = existing.data.find(w => w.url === WEBHOOK_URL);
    if (alreadyExists) {
      res.json({
        alreadyExists: true,
        webhookId: alreadyExists.id,
        url: alreadyExists.url,
        message: "Webhook already registered. The signing secret was set when it was first created — update STRIPE_WEBHOOK_SECRET if needed.",
      });
      return;
    }

    const webhook = await stripe.webhookEndpoints.create({
      url: WEBHOOK_URL,
      enabled_events: [
        "payment_intent.succeeded",
        "payment_intent.payment_failed",
        "charge.dispute.created",
        "charge.refunded",
      ],
      description: "Royal Midnight payment confirmation webhook",
    });

    // Persist signing secret to DB so webhook handler works immediately (even before env var is set)
    if (webhook.secret) {
      await db
        .insert(settingsTable)
        .values({ key: "stripe_webhook_secret", value: webhook.secret })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value: webhook.secret } });
    }

    res.json({
      alreadyExists: false,
      webhookId: webhook.id,
      url: webhook.url,
      signingSecret: webhook.secret,
      message: "Webhook registered successfully. The signing secret has been saved and is active. Optionally set it as STRIPE_WEBHOOK_SECRET in your environment for extra security.",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin: send a Stripe Invoice to the passenger's email for manual bookings

router.post("/payments/create-invoice/:bookingId", async (req, res): Promise<void> => {
  const bId = parseInt(req.params["bookingId"] ?? "", 10);
  if (!bId) { res.status(400).json({ error: "Invalid booking id" }); return; }

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bId));
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
  if (booking.status !== "awaiting_payment") {
    res.status(400).json({ error: "Booking is not awaiting payment" }); return;
  }

  try {
    const stripe = getStripe();
    const amount = Math.round(parseFloat(String(booking.priceQuoted)) * 100);

    const existingCustomers = await stripe.customers.list({ email: booking.passengerEmail, limit: 1 });
    const customer = existingCustomers.data.length > 0
      ? existingCustomers.data[0]
      : await stripe.customers.create({
          email: booking.passengerEmail,
          name: booking.passengerName,
          metadata: { bookingId: String(bId) },
        });

    const bookingRef = `RM-${String(bId).padStart(4, "0")}`;

    await stripe.invoiceItems.create({
      customer: customer.id,
      amount,
      currency: "usd",
      description: `Royal Midnight Chauffeur — Booking ${bookingRef}\n${booking.pickupAddress} → ${booking.dropoffAddress}`,
    });

    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: "send_invoice",
      days_until_due: 7,
      metadata: { bookingId: String(bId) },
      description: `Royal Midnight — Reservation ${bookingRef}`,
    });

    const finalised = await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(finalised.id);

    res.json({ success: true, invoiceId: finalised.id, invoiceUrl: finalised.hosted_invoice_url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stripe webhook ──────────────────────────────────────────────────────────

router.post("/webhook/stripe", async (req, res): Promise<void> => {
  const sig = req.headers["stripe-signature"] as string | undefined;

  let event: Stripe.Event;

  try {
    const stripe = getStripe();

    // Look up signing secret: env var preferred, DB fallback (from auto-registration)
    const webhookSecret = await getWebhookSecret();

    if (!webhookSecret) {
      console.error("[webhook] STRIPE_WEBHOOK_SECRET not set — refusing unsigned event");
      res.status(503).json({ error: "Webhook signing secret not configured" });
      return;
    }

    if (!sig) {
      res.status(400).json({ error: "Missing Stripe-Signature header" });
      return;
    }

    // Signature verification is mandatory — no fallback to unsigned processing
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const bookingId = parseInt(intent.metadata.bookingId || "0");
      if (bookingId) {
        const [current] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, bookingId));
        if (current && current.status === "awaiting_payment") {
          await db.update(bookings)
            .set({ status: "pending", updatedAt: new Date() })
            .where(eq(bookings.id, bookingId));
          firePostPaymentEmails(bookingId).catch(err => console.error("[payments] webhook pi email error:", err));
        }
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const bookingId = parseInt(intent.metadata.bookingId || "0");
      if (bookingId) {
        // Mark booking as cancelled so passengers know to retry or contact support
        const [current] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, bookingId));
        if (current && current.status === "awaiting_payment") {
          await db.update(bookings)
            .set({ status: "cancelled", updatedAt: new Date() })
            .where(eq(bookings.id, bookingId));
          console.warn(`[payments] Booking #${bookingId} cancelled due to payment failure:`, intent.last_payment_error?.message);
        }
      }
    }

    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Stripe.Dispute;
      console.warn("[payments] Chargeback dispute opened:", dispute.id, "amount:", dispute.amount, "reason:", dispute.reason);
    }

    res.json({ received: true });
  } catch (err: any) {
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

export default router;
