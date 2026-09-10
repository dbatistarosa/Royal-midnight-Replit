import crypto from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { rows } from "./durability.js";

export type AddonSnapshot = {
  priced: Array<{ id: number; name: string; quantity: number; price: number }>;
  charge: { fare: number; taxAmount: number; cardProcessingFee: number; total: number };
};
export type AddonOperation = { id: string; booking_id: number; request_hash: string;
  snapshot: AddonSnapshot; payment_intent_id: string | null; invoice_id: string | null;
  response: Record<string, unknown> | null };

export function addonRequestHash(method: string, extras: Array<{id: number; quantity?: number}>) {
  return crypto.createHash("sha256").update(JSON.stringify({ method,
    extras: extras.map(e => ({id:e.id, quantity:e.quantity ?? 1})).sort((a,b)=>a.id-b.id),
  })).digest("hex");
}
/** Caller holds the per-booking payment lock. Freeze pricing before any Stripe call. */
export async function loadAddonOperation(id: string, bookingId: number, hash: string) {
  const [op] = rows<AddonOperation>(await db.execute(sql`SELECT * FROM booking_adjustments WHERE id=${id}`));
  if (op && (op.booking_id !== bookingId || op.request_hash !== hash)) {
    throw Object.assign(new Error("This operation key was already used for different extras"), {status:409});
  }
  return op;
}
export async function createAddonOperation(id: string, bookingId: number, hash: string, snapshot: AddonSnapshot) {
  await db.execute(sql`INSERT INTO booking_adjustments(id,booking_id,request_hash,snapshot)
    VALUES(${id},${bookingId},${hash},${JSON.stringify(snapshot)}::jsonb) ON CONFLICT DO NOTHING`);
  return (await loadAddonOperation(id, bookingId, hash))!;
}
