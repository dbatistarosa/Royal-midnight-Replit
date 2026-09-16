import { db, bookingsTable } from "@workspace/db";
import { and, inArray, isNull, lte, sql } from "drizzle-orm";
import { rows } from "./durability.js";

const OPEN_UNASSIGNED = ["pending", "authorized", "confirmed"];

/**
 * Cancel trips whose pickup has passed without a chauffeur and queue a full,
 * retryable Stripe settlement. The conditional UPDATE is the claim: a driver
 * accepting at the same instant wins or loses atomically, never both.
 */
export async function expireUnassignedBookings(now = new Date()): Promise<number> {
  const candidates = await db
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(
      and(
        isNull(bookingsTable.driverId),
        lte(bookingsTable.pickupAt, now),
        inArray(bookingsTable.status, OPEN_UNASSIGNED),
      ),
    );

  let expired = 0;
  for (const { id } of candidates) {
    const didExpire = await db.transaction(async (tx) => {
      const [booking] = rows<{
        id: number;
        stripe_payment_intent_id: string | null;
        price_quoted: string;
      }>(
        await tx.execute(sql`
          UPDATE bookings
             SET status='cancelled',
                 cancellation_reason='No chauffeur accepted before pickup',
                 cancellation_notes='Automatically cancelled after the pickup time passed unassigned',
                 cancelled_by='system', cancelled_at=${now}, updated_at=${now},
                 refund_amount=price_quoted
           WHERE id=${id} AND driver_id IS NULL AND pickup_at<=${now}
             AND status IN ('pending','authorized','confirmed')
          RETURNING id,stripe_payment_intent_id,price_quoted
        `),
      );
      if (!booking) return false;
      const payload = {
        intentId: booking.stripe_payment_intent_id,
        refundCents: Math.round(Number(booking.price_quoted) * 100),
        feeAmount: 0,
      };
      await tx.execute(sql`
        INSERT INTO app_jobs(key,kind,booking_id,payload)
        VALUES(${"booking-cancellation:" + booking.id},'booking-cancellation',${booking.id},${JSON.stringify(payload)}::jsonb)
        ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,status='pending',available_at=now(),last_error=NULL
      `);
      return true;
    });
    if (didExpire) expired += 1;
  }
  return expired;
}
