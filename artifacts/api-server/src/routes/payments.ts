import { Router, type IRouter } from "express";
import Stripe from "stripe";
import { db } from "@workspace/db";
import { bookingsTable as bookings } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2024-06-20" as any });
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
  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status === "succeeded") {
      await db.update(bookings)
        .set({ status: "confirmed", updatedAt: new Date() })
        .where(eq(bookings.id, parseInt(bookingId)));
      res.json({ success: true, status: "confirmed" });
    } else {
      res.status(400).json({ error: "Payment not completed", status: intent.status });
    }
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
      // Verify signature when secret is configured (production / test with secret)
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // In test mode without a signing secret, parse directly (no verification)
      const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf-8") : JSON.stringify(req.body);
      event = JSON.parse(payload) as Stripe.Event;
    }

    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const bookingId = parseInt(intent.metadata.bookingId || "0");
      if (bookingId) {
        await db.update(bookings)
          .set({ status: "confirmed", updatedAt: new Date() })
          .where(eq(bookings.id, bookingId));
      }
    }
    res.json({ received: true });
  } catch (err: any) {
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

export default router;
