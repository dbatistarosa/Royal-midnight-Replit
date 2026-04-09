import { Router, type IRouter } from "express";
import Stripe from "stripe";
import { db } from "@workspace/db";
import { bookingsTable as bookings, driversTable, settingsTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  sendBookingConfirmationPassenger,
  sendNewBookingAdmin,
  sendNewBookingAvailableToDrivers,
  sendInvoiceToPassenger,
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

    const paymentIntent = await stripe.paymentIntents.create(
      { amount: Math.round(amount * 100), currency: "usd", payment_method_types: ["card"], metadata, description },
      bookingId ? { idempotencyKey: `create-intent-booking-${bookingId}` } : undefined,
    );
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Lookup which booking a PaymentIntent belongs to (via PI metadata) — used by
// the frontend 3DS recovery path when sessionStorage is unavailable.
router.get("/payments/find-booking", async (req, res): Promise<void> => {
  const { paymentIntentId } = req.query as { paymentIntentId?: string };
  if (!paymentIntentId) {
    res.status(400).json({ error: "paymentIntentId is required" });
    return;
  }
  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const bId = parseInt(intent.metadata.bookingId || "0", 10);
    if (!bId) {
      res.status(404).json({ error: "No booking linked to this PaymentIntent" });
      return;
    }
    res.json({ bookingId: bId });
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

    // Enforce PI-to-booking binding — metadata must match OR metadata is missing
    // (the latter can happen if the PI was created before the booking was stored).
    const metaId = intent.metadata.bookingId;
    if (metaId && metaId !== String(bId)) {
      res.status(403).json({ error: "PaymentIntent does not belong to this booking" });
      return;
    }

    if (intent.status === "succeeded" || intent.status === "processing") {
      const [current] = await db.select({ status: bookings.status, stripePaymentIntentId: bookings.stripePaymentIntentId }).from(bookings).where(eq(bookings.id, bId));
      if (!current) {
        res.status(404).json({ error: "Booking not found" });
        return;
      }
      if (intent.status === "succeeded" && current.status === "awaiting_payment") {
        // Direct success — promote to pending immediately and send emails.
        await db.update(bookings)
          .set({ status: "pending", stripePaymentIntentId: paymentIntentId, updatedAt: new Date() })
          .where(eq(bookings.id, bId));
        firePostPaymentEmails(bId).catch(err => console.error("[payments] post-confirm email error:", err));
      } else if (intent.status === "processing" && current.status === "awaiting_payment") {
        // Async payment method (e.g. ACH/bank transfer) — store the PI ID now.
        // The booking stays awaiting_payment; the payment_intent.succeeded webhook
        // will promote it to pending once the charge actually settles.
        await db.update(bookings)
          .set({ stripePaymentIntentId: paymentIntentId, updatedAt: new Date() })
          .where(eq(bookings.id, bId));
      } else if (!current.stripePaymentIntentId) {
        // Store PI ID even if booking was already moved to pending (e.g. by webhook)
        await db.update(bookings)
          .set({ stripePaymentIntentId: paymentIntentId, updatedAt: new Date() })
          .where(eq(bookings.id, bId));
      }
      if (intent.status === "processing") {
        res.json({ success: true, status: "awaiting_payment", paymentIntentId, paymentStatus: "processing" });
      } else {
        const resolvedStatus = current.status === "awaiting_payment" ? "pending" : current.status;
        res.json({ success: true, status: resolvedStatus, paymentIntentId, paymentStatus: intent.status });
      }
    } else {
      // Definitive failure statuses (canceled, requires_payment_method, etc.)
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

  // If already paid/confirmed, return success immediately
  if (booking.status !== "awaiting_payment") {
    res.json({
      confirmed: true,
      alreadyPaid: true,
      message: `Booking is already confirmed (status: ${booking.status}).`,
      paymentIntentId: booking.stripePaymentIntentId ?? undefined,
    });
    return;
  }

  try {
    const stripe = getStripe();

    // 1. Check PaymentIntents with bookingId metadata (card payment flow)
    const intents = await stripe.paymentIntents.search({
      query: `metadata["bookingId"]:"${bId}"`,
      limit: 5,
    });
    const succeededIntent = intents.data.find(pi => pi.status === "succeeded");
    if (succeededIntent) {
      await db.update(bookings)
        .set({ status: "pending", stripePaymentIntentId: succeededIntent.id, updatedAt: new Date() })
        .where(eq(bookings.id, bId));
      firePostPaymentEmails(bId).catch(() => {});
      res.json({ confirmed: true, source: "payment_intent", paymentIntentId: succeededIntent.id, message: "Payment confirmed — booking moved to pending." });
      return;
    }

    // 2. Check Stripe invoices with bookingId metadata (send-invoice flow)
    const invoiceSearch = await stripe.invoices.search({
      query: `metadata["bookingId"]:"${bId}"`,
      limit: 5,
    });
    const paidInvoice = invoiceSearch.data.find(inv => inv.status === "paid");
    if (paidInvoice) {
      await db.update(bookings)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(bookings.id, bId));
      firePostPaymentEmails(bId).catch(() => {});
      res.json({ confirmed: true, source: "invoice", invoiceId: paidInvoice.id, message: "Invoice payment confirmed — booking moved to pending." });
      return;
    }

    const intentStatuses = intents.data.map(pi => pi.status).join(", ") || "none";
    const invoiceStatuses = invoiceSearch.data.map(inv => inv.status).join(", ") || "none";
    res.json({ confirmed: false, message: `No successful payment found. PaymentIntents: ${intentStatuses}. Invoices: ${invoiceStatuses}.` });
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

    const REQUIRED_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
      "payment_intent.created",
      "payment_intent.succeeded",
      "payment_intent.payment_failed",
      "charge.succeeded",
      "charge.updated",
      "charge.refunded",
      "charge.dispute.created",
      "invoice.paid",
    ];
    const existing = await stripe.webhookEndpoints.list({ limit: 20 });
    const alreadyExists = existing.data.find(w => w.url === WEBHOOK_URL);
    if (alreadyExists) {
      // Ensure the existing webhook has all required events
      const currentEvents = alreadyExists.enabled_events ?? [];
      const missingEvents = REQUIRED_EVENTS.filter(e => !currentEvents.includes(e));
      if (missingEvents.length > 0) {
        const mergedEvents = Array.from(new Set([...currentEvents, ...REQUIRED_EVENTS])) as Stripe.WebhookEndpointUpdateParams.EnabledEvent[];
        await stripe.webhookEndpoints.update(alreadyExists.id, { enabled_events: mergedEvents });
      }
      res.json({
        alreadyExists: true,
        webhookId: alreadyExists.id,
        url: alreadyExists.url,
        eventsUpdated: missingEvents.length > 0,
        addedEvents: missingEvents,
        message: missingEvents.length > 0
          ? `Webhook events updated to include: ${missingEvents.join(", ")}. The signing secret was set when it was first created.`
          : "Webhook already registered with all required events. The signing secret was set when it was first created — update STRIPE_WEBHOOK_SECRET if needed.",
      });
      return;
    }

    const webhook = await stripe.webhookEndpoints.create({
      url: WEBHOOK_URL,
      enabled_events: [
        "payment_intent.created",
        "payment_intent.succeeded",
        "payment_intent.payment_failed",
        "charge.succeeded",
        "charge.updated",
        "charge.refunded",
        "charge.dispute.created",
        "invoice.paid",
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

// ─── Admin: ensure existing webhook has required events subscribed
router.post("/admin/stripe/ensure-webhook-events", requireAdmin, async (_req, res): Promise<void> => {
  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(503).json({ error: "STRIPE_SECRET_KEY is not configured" });
    return;
  }
  const REQUIRED_EVENTS: Stripe.WebhookEndpointUpdateParams.EnabledEvent[] = [
    "payment_intent.created",
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "charge.succeeded",
    "charge.updated",
    "charge.refunded",
    "charge.dispute.created",
    "invoice.paid",
  ];
  try {
    const stripe = getStripe();
    const existing = await stripe.webhookEndpoints.list({ limit: 20 });
    const ours = existing.data.find(w => w.url === WEBHOOK_URL);
    if (!ours) {
      res.json({ updated: false, message: "No webhook registered yet. Use register-webhook first." });
      return;
    }
    const currentEvents = ours.enabled_events ?? [];
    const missingEvents = REQUIRED_EVENTS.filter(e => !currentEvents.includes(e));
    if (missingEvents.length === 0) {
      res.json({ updated: false, webhookId: ours.id, enabledEvents: currentEvents, message: "All required events already subscribed." });
      return;
    }
    // Merge existing events with required ones
    const mergedEvents = Array.from(new Set([...currentEvents, ...REQUIRED_EVENTS])) as Stripe.WebhookEndpointUpdateParams.EnabledEvent[];
    const updated = await stripe.webhookEndpoints.update(ours.id, { enabled_events: mergedEvents });
    res.json({ updated: true, webhookId: updated.id, enabledEvents: updated.enabled_events, addedEvents: missingEvents, message: "Webhook events updated to include all required events." });
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
    if (!amount || amount <= 0) {
      res.status(400).json({ error: "Booking has no valid price to invoice." });
      return;
    }

    const bookingRef = `RM-${String(bId).padStart(4, "0")}`;

    // Find or create the Stripe customer
    const existingCustomers = await stripe.customers.list({ email: booking.passengerEmail, limit: 1 });
    const customer = existingCustomers.data.length > 0
      ? existingCustomers.data[0]
      : await stripe.customers.create({
          email: booking.passengerEmail,
          name: booking.passengerName,
          metadata: { bookingId: String(bId) },
        });

    // Void any pre-existing open invoices for this booking to avoid stale state
    const openInvoices = await stripe.invoices.list({
      customer: customer.id,
      status: "open",
      limit: 10,
    });
    for (const inv of openInvoices.data) {
      if (inv.metadata?.bookingId === String(bId)) {
        await stripe.invoices.voidInvoice(inv.id);
      }
    }

    // Also remove any dangling pending invoice items for this customer so they
    // don't contaminate the new invoice total
    const pendingItems = await stripe.invoiceItems.list({
      customer: customer.id,
      pending: true,
      limit: 100,
    });
    for (const item of pendingItems.data) {
      await stripe.invoiceItems.del(item.id);
    }

    // Create the draft invoice FIRST so we can attach the line item directly to
    // it — this bypasses Stripe's "pending items" pool entirely and guarantees
    // the invoice total is exactly what we expect.
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: "send_invoice",
      days_until_due: 7,
      metadata: { bookingId: String(bId) },
      description: `Royal Midnight — Reservation ${bookingRef}`,
    });

    // Attach the line item directly to the draft invoice
    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: invoice.id,
      amount,
      currency: "usd",
      description: `Royal Midnight Chauffeur — Booking ${bookingRef} · ${booking.pickupAddress} → ${booking.dropoffAddress}`,
    });

    // Retrieve the draft to confirm the total before finalising
    const draft = await stripe.invoices.retrieve(invoice.id);
    if ((draft.amount_due ?? 0) !== amount) {
      await stripe.invoices.del(invoice.id);
      res.status(500).json({ error: `Invoice total mismatch: expected $${(amount / 100).toFixed(2)}, got $${((draft.amount_due ?? 0) / 100).toFixed(2)}. Please try again.` });
      return;
    }

    const finalised = await stripe.invoices.finalizeInvoice(invoice.id);

    const invoiceUrl = finalised.hosted_invoice_url ?? "";
    const invoicePdfUrl = finalised.invoice_pdf ?? null;

    if (!invoiceUrl) {
      res.status(500).json({ error: "Invoice finalised but no payment URL was generated. Please try again." });
      return;
    }

    await sendInvoiceToPassenger(
      {
        id: bId,
        passengerName: booking.passengerName,
        passengerEmail: booking.passengerEmail,
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,
        pickupAt: String(booking.pickupAt),
        vehicleClass: booking.vehicleClass,
        passengers: booking.passengers,
        priceQuoted: parseFloat(String(booking.priceQuoted)),
      },
      invoiceUrl,
      invoicePdfUrl,
    );

    res.json({ success: true, invoiceId: finalised.id, invoiceUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stripe webhook ──────────────────────────────────────────────────────────

async function confirmBookingFromPaymentIntent(bookingId: number, intentId: string, maxAttempts = 4): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const [current] = await db
      .select({ status: bookings.status, stripePaymentIntentId: bookings.stripePaymentIntentId })
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    if (!current) {
      if (attempt < maxAttempts) {
        console.warn(`[payments] webhook: booking #${bookingId} not found yet — retrying in ${2 * attempt}s (attempt ${attempt}/${maxAttempts})`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
        continue;
      }
      console.error(`[payments] Booking #${bookingId} not found after ${maxAttempts} attempts`);
      return;
    }
    if (current.status === "awaiting_payment") {
      await db.update(bookings)
        .set({ status: "pending", stripePaymentIntentId: intentId, updatedAt: new Date() })
        .where(eq(bookings.id, bookingId));
      console.log(`[payments] PI succeeded → Booking #${bookingId} → pending (PI: ${intentId})`);
      await firePostPaymentEmails(bookingId);
    } else if (!current.stripePaymentIntentId) {
      await db.update(bookings)
        .set({ stripePaymentIntentId: intentId, updatedAt: new Date() })
        .where(eq(bookings.id, bookingId));
    }
    return;
  }
}

router.post("/webhook/stripe", async (req, res): Promise<void> => {
  const sig = req.headers["stripe-signature"] as string | undefined;
  let event: Stripe.Event;

  try {
    const stripe = getStripe();
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
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Acknowledge Stripe immediately — processing happens below
  res.json({ received: true });

  try {
    if (event.type === "payment_intent.created") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const bookingId = parseInt(intent.metadata.bookingId || "0");
      console.log(`[payments] PI created: ${intent.id}${bookingId ? ` (booking #${bookingId})` : ""}`);
      if (bookingId) {
        const [current] = await db
          .select({ stripePaymentIntentId: bookings.stripePaymentIntentId })
          .from(bookings)
          .where(eq(bookings.id, bookingId));
        if (current && !current.stripePaymentIntentId) {
          await db.update(bookings)
            .set({ stripePaymentIntentId: intent.id, updatedAt: new Date() })
            .where(eq(bookings.id, bookingId));
        }
      }
    }

    if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      const bookingId = parseInt(invoice.metadata?.bookingId || "0");
      if (bookingId) {
        const piId = typeof invoice.payment_intent === "string" ? invoice.payment_intent : (invoice.payment_intent as any)?.id ?? null;
        const [current] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, bookingId));
        if (current && current.status === "awaiting_payment") {
          await db.update(bookings)
            .set({ status: "pending", stripePaymentIntentId: piId ?? undefined, updatedAt: new Date() })
            .where(eq(bookings.id, bookingId));
          console.log(`[payments] Invoice paid → Booking #${bookingId} → pending (PI: ${piId ?? "N/A"})`);
          firePostPaymentEmails(bookingId).catch(err => console.error("[payments] invoice.paid email error:", err));
        }
      }
    }

    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const bookingId = parseInt(intent.metadata.bookingId || "0");
      if (bookingId) {
        await confirmBookingFromPaymentIntent(bookingId, intent.id);
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const bookingId = parseInt(intent.metadata.bookingId || "0");
      if (bookingId) {
        const [current] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, bookingId));
        if (current && current.status === "awaiting_payment") {
          await db.update(bookings)
            .set({ status: "cancelled", updatedAt: new Date() })
            .where(eq(bookings.id, bookingId));
          console.warn(`[payments] Booking #${bookingId} cancelled due to payment failure:`, intent.last_payment_error?.message);
        }
      }
    }

    if (event.type === "charge.succeeded") {
      const charge = event.data.object as Stripe.Charge;
      console.log(`[payments] charge.succeeded: ${charge.id} PI: ${charge.payment_intent} amount: $${(charge.amount / 100).toFixed(2)}`);
    }

    if (event.type === "charge.updated") {
      const charge = event.data.object as Stripe.Charge;
      console.log(`[payments] charge.updated: ${charge.id} status: ${charge.status} PI: ${charge.payment_intent}`);
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      console.log(`[payments] charge.refunded: ${charge.id} amount_refunded: $${(charge.amount_refunded / 100).toFixed(2)}`);
    }

    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Stripe.Dispute;
      console.warn("[payments] Chargeback dispute opened:", dispute.id, "amount:", dispute.amount, "reason:", dispute.reason);
    }
  } catch (err: any) {
    console.error("[payments] webhook processing error:", err.message);
  }
});

export default router;
