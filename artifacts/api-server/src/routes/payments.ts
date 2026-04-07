import { Router, type IRouter } from "express";
import Stripe from "stripe";
import { db } from "@workspace/db";
import { bookingsTable as bookings, driversTable, settingsTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  sendBookingConfirmationPassenger,
  sendNewBookingAdmin,
  sendNewBookingAvailableToDrivers,
} from "../lib/mailer.js";

const router: IRouter = Router();

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2024-06-20" as any });
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
  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status === "succeeded") {
      await db.update(bookings)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(bookings.id, bId));
      res.json({ success: true, status: "pending" });
      // Fire-and-forget: send confirmation + notify drivers
      firePostPaymentEmails(bId).catch(err => console.error("[payments] post-confirm email error:", err));
    } else {
      res.status(400).json({ error: "Payment not completed", status: intent.status });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: send a Stripe Invoice to the passenger's email for manual bookings
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

    // Find or create a Stripe customer for the passenger
    const existingCustomers = await stripe.customers.list({ email: booking.passengerEmail, limit: 1 });
    const customer = existingCustomers.data.length > 0
      ? existingCustomers.data[0]
      : await stripe.customers.create({
          email: booking.passengerEmail,
          name: booking.passengerName,
          metadata: { bookingId: String(bId) },
        });

    const bookingRef = `RM-${String(bId).padStart(4, "0")}`;

    // Create an invoice item then a finalised invoice (auto-sends payment link)
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

router.post("/webhook/stripe", async (req, res): Promise<void> => {
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf-8") : JSON.stringify(req.body);
      event = JSON.parse(payload) as Stripe.Event;
    }

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

    // Invoice paid via emailed link
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const bookingId = parseInt((invoice.metadata as Record<string, string>)?.bookingId || "0");
      if (bookingId) {
        const [current] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, bookingId));
        if (current && current.status === "awaiting_payment") {
          await db.update(bookings)
            .set({ status: "pending", updatedAt: new Date() })
            .where(eq(bookings.id, bookingId));
          firePostPaymentEmails(bookingId).catch(err => console.error("[payments] webhook invoice email error:", err));
        }
      }
    }

    res.json({ received: true });
  } catch (err: any) {
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

export default router;
