import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { rows } from "./durability.js";
import { sendExtraTimeChargedEmail } from "./mailer.js";
import { withMailScope, withMailTransaction } from "./mailOutbox.js";
import type { AddonOperation, AddonSnapshot } from "./addonOperation.js";

export async function loadOvertimeOperation(bookingId: number) {
  const [op] = rows<AddonOperation>(await db.execute(sql`SELECT * FROM booking_adjustments WHERE id=${'extra-time:' + bookingId}`));
  if (op && op.booking_id !== bookingId) throw new Error('Overtime operation mismatch');
  return op;
}

export async function overtimeOperation(bookingId: number, charge: AddonSnapshot["charge"], minutes: number, allowCreate = false) {
  const existing = await loadOvertimeOperation(bookingId);
  if (existing) return existing;
  // Only the new driver-completion path may originate an automatic charge.
  // A historical completion without an operation may already have charged Stripe.
  if (!allowCreate) throw Object.assign(new Error('Historical overtime needs payment reconciliation before collection'), {status:409});
  const id = 'extra-time:' + bookingId;
  const snapshot = {priced: [], charge, overtimeMinutes: minutes};
  // The booking identifies this one-time operation; prices are never recalculated on retry.
  await db.execute(sql`INSERT INTO booking_adjustments(id,booking_id,request_hash,snapshot)
    VALUES(${id},${bookingId},'overtime-v1',${JSON.stringify(snapshot)}::jsonb) ON CONFLICT DO NOTHING`);
  const [op] = rows<AddonOperation>(await db.execute(sql`SELECT * FROM booking_adjustments WHERE id=${id}`));
  if (!op || op.booking_id !== bookingId) throw new Error('Overtime operation unavailable');
  return op;
}

/** Caller holds payment:<bookingId>. The confirmed payment, totals and receipt commit together. */
export async function settleOvertime(op: AddonOperation, paymentIntentId: string) {
  const charge = op.snapshot.charge;
  const minutes = op.snapshot.overtimeMinutes;
  if (!Number.isFinite(minutes) || minutes! < 0) throw new Error('Overtime duration needs review');
  return db.transaction(async tx => {
    const [booking] = rows<{passenger_name:string;passenger_email:string;total_price:string}>(await tx.execute(sql`
      UPDATE bookings SET extra_charge=${charge.total}, total_price=price_quoted+${charge.total},
        overage_fare=${charge.fare}, overage_tax=${charge.taxAmount},
        overage_card_fee=${charge.cardProcessingFee}, overage_minutes=${minutes!},
        extra_charge_payment_intent_id=${paymentIntentId}, updated_at=now()
      WHERE id=${op.booking_id} AND status='completed'
        AND (extra_charge_payment_intent_id IS NULL OR extra_charge_payment_intent_id=${paymentIntentId})
      RETURNING passenger_name,passenger_email,total_price`));
    if (!booking) throw new Error('Booking changed; overtime settlement needs review');
    await withMailScope(op.id, () => withMailTransaction(tx, () => sendExtraTimeChargedEmail({
      bookingId:op.booking_id, passengerName:booking.passenger_name, passengerEmail:booking.passenger_email,
      overtimeMinutes:minutes!, ...charge,
    })));
    const response = {ok:true,paymentIntentId,charge,totalPrice:Number(booking.total_price)};
    await tx.execute(sql`UPDATE booking_adjustments SET response=${JSON.stringify(response)}::jsonb,
      applied_at=now() WHERE id=${op.id} AND payment_intent_id=${paymentIntentId}`);
    return response;
  });
}
