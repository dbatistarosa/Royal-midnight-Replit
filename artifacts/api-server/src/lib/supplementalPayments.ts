import type Stripe from "stripe";
import { db, bookingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

/** Only call after Stripe signature verification. These are not reservation payments. */
export function supplementalPaymentFact(event: Stripe.Event) {
  const object = event.data.object as unknown as {
    id: string; metadata?: Record<string, string>; currency?: string;
    amount?: number; amount_received?: number; amount_paid?: number;
    total?: number; status?: string;
  };
  const purpose = object.metadata?.type;
  if (!purpose || !["tip", "extra_time", "addon_extras"].includes(purpose)) return null;
  const isIntent = event.type.startsWith("payment_intent.");
  const isInvoice = event.type.startsWith("invoice.");
  if (!isIntent && !isInvoice) return null;
  const bookingId = Number(object.metadata?.bookingId);
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0) throw new Error("Supplemental payment has no valid booking");
  const amount = isIntent
    ? event.type === "payment_intent.succeeded" ? object.amount_received : object.amount
    : event.type === "invoice.paid" ? object.amount_paid : object.total;
  if (!Number.isSafeInteger(amount) || amount! < 0 || object.currency !== "usd") {
    throw new Error("Invalid supplemental payment amount or currency");
  }
  return { bookingId, amount: amount!, currency: object.currency, reference: object.id,
    kind: `${purpose}:${event.type}`, status: object.status ?? event.type };
}

export async function recordSupplementalPayment(event: Stripe.Event): Promise<boolean> {
  const fact = supplementalPaymentFact(event);
  if (!fact) return false;
  const [booking] = await db.select({ id: bookingsTable.id }).from(bookingsTable).where(eq(bookingsTable.id, fact.bookingId));
  if (!booking) throw new Error("Supplemental payment booking not found");
  // Immutable event facts remain useful when Stripe delivers older states later.
  // They do not replace the reservation's intent/invoice or enqueue a confirmation.
  await db.execute(sql`INSERT INTO financial_events(id,booking_id,kind,amount_cents,currency,status,reference)
    VALUES(${'supplemental:' + event.id},${fact.bookingId},${fact.kind},${fact.amount},${fact.currency},${fact.status},${fact.reference})
    ON CONFLICT(id) DO NOTHING`);
  return true;
}
