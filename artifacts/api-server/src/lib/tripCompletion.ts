import { db, bookingsTable, driversTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { sendTripCompletionEmail } from "./mailer.js";
import { maybeRewardReferrerForCompletedRide } from "./referrals.js";

type Completion = {
  bookingId: number;
  driverId: number;
  endedAt: Date;
  extraCharge: number;
  totalPrice: number;
  breakdown?: { fare: number; taxAmount: number; cardProcessingFee: number; minutes: number };
};

/** The CAS, counter, money breakdown and retryable notification commit together. */
export async function commitTripCompletion(input: Completion) {
  return db.transaction(async tx => {
    const [updated] = await tx.update(bookingsTable).set({
      status: "completed", tripEndedAt: input.endedAt,
      extraCharge: String(input.extraCharge), totalPrice: String(input.totalPrice),
      updatedAt: input.endedAt,
    }).where(and(eq(bookingsTable.id, input.bookingId),
      eq(bookingsTable.driverId, input.driverId), eq(bookingsTable.status, "in_progress"))).returning();
    if (!updated) return undefined;
    await tx.update(driversTable).set({ totalRides: sql`${driversTable.totalRides} + 1` })
      .where(eq(driversTable.id, input.driverId));
    if (input.breakdown) {
      const b = input.breakdown;
      await tx.execute(sql`UPDATE bookings SET overage_fare=${b.fare}, overage_tax=${b.taxAmount},
        overage_card_fee=${b.cardProcessingFee}, overage_minutes=${b.minutes} WHERE id=${input.bookingId}`);
    }
    await tx.execute(sql`INSERT INTO app_jobs(key,kind,booking_id)
      VALUES(${'trip-completion:' + input.bookingId},'trip-completion',${input.bookingId}) ON CONFLICT DO NOTHING`);
    return updated;
  });
}

/** Invoked under the worker's payment lock and stable mail deduplication scope. */
export async function notifyTripCompletion(bookingId: number) {
  const [b] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!b || b.status !== "completed") return;
  await sendTripCompletionEmail({
    id: b.id, passengerName: b.passengerName, passengerEmail: b.passengerEmail,
    pickupAddress: b.pickupAddress, dropoffAddress: b.dropoffAddress,
    pickupAt: b.pickupAt.toISOString(), vehicleClass: b.vehicleClass ?? "standard",
    passengers: b.passengers ?? 1, priceQuoted: Number(b.priceQuoted),
  }, b.tipAmount == null ? null : Number(b.tipAmount), Number(b.extraCharge) || null);
  if (b.userId) await maybeRewardReferrerForCompletedRide(b.userId);
}
