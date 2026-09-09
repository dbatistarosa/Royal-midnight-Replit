import Stripe from "stripe";
import { db, bookingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { rows } from "./durability.js";
import { serializeBooking } from "./serializeBooking.js";
import {
  sendBookingCancelledAdmin,
  sendBookingCancelledPassenger,
} from "./mailer.js";

export type CancellationPayload = {
  intentId: string | null;
  refundCents: number;
  feeAmount: number;
};
export async function settleBookingCancellation(
  bookingId: number,
  overrideIntent?: string,
) {
  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId));
  if (!booking || booking.status !== "cancelled") return;
  const [job] = rows<{ payload: CancellationPayload }>(
    await db.execute(
      sql`SELECT payload FROM app_jobs WHERE key=${"booking-cancellation:" + bookingId}`,
    ),
  );
  const intentId =
    overrideIntent ?? job?.payload.intentId ?? booking.stripePaymentIntentId;
  const target =
    job?.payload.refundCents ?? Math.round(Number(booking.priceQuoted) * 100);
  if (intentId) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2024-06-20" as const,
      timeout: 8000,
      maxNetworkRetries: 0,
    });
    const pi = await stripe.paymentIntents.retrieve(intentId, {
      expand: ["latest_charge"],
    });
    if (pi.status === "processing")
      throw new Error("Cancellation payment is still processing");
    if (
      [
        "requires_payment_method",
        "requires_confirmation",
        "requires_action",
        "requires_capture",
      ].includes(pi.status)
    ) {
      await stripe.paymentIntents.cancel(
        intentId,
        {},
        { idempotencyKey: "booking-cancel-" + intentId },
      );
    } else if (pi.status === "succeeded") {
      const charge = pi.latest_charge as Stripe.Charge | null;
      const remaining = Math.max(
        0,
        Math.min(target, pi.amount_received) - (charge?.amount_refunded ?? 0),
      );
      if (remaining > 0)
        await stripe.refunds.create(
          { payment_intent: intentId, amount: remaining },
          {
            idempotencyKey:
              "booking-cancellation-refund-" + intentId + "-" + target,
          },
        );
    }
  }
  const data = serializeBooking(booking);
  await sendBookingCancelledAdmin(data);
  await sendBookingCancelledPassenger(data, job?.payload.feeAmount ?? 0);
}
