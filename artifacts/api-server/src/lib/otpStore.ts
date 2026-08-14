import crypto from "crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { db, otpCodesTable } from "@workspace/db";
import { hasPgErrorCode, UNDEFINED_COLUMN, UNDEFINED_TABLE } from "./pgError.js";

/**
 * Storage for SMS login codes.
 *
 * These used to live in a module-level Map. On Vercel every instance keeps its
 * own, so a verify could land on an instance that never saw the send — login by
 * SMS was intermittent by design — and the per-code attempt ceiling was counted
 * per instance, making the real limit 5 x however many instances were warm.
 * The otp_codes table existed the whole time and was never used.
 *
 * Only the SHA-256 of the code is stored, so reading this table does not hand
 * anyone a working login factor.
 *
 * The in-memory map survives as a fallback for the window where this code is
 * deployed and migration 0007 has not been applied yet, and for local runs
 * against an older schema. It is strictly worse and logs when it is used.
 */

const TTL_MS = 10 * 60 * 1000;

/** Maximum wrong guesses accepted for a single issued code. The IP-keyed rate
 *  limiter alone does not stop a distributed guess against one phone number, so
 *  the code itself is burned after a few failures. */
export const MAX_OTP_ATTEMPTS = 5;

export type OtpVerdict = "ok" | "invalid" | "too_many_attempts";

const memoryStore = new Map<string, { otpHash: string; expiresAt: number; attempts: number }>();

function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

/** True when the failure is "schema is older than this code" rather than a real
 *  database problem, which must still surface. */
function isSchemaMissing(err: unknown): boolean {
  return hasPgErrorCode(err, UNDEFINED_TABLE) || hasPgErrorCode(err, UNDEFINED_COLUMN);
}

/** Issue a code for this phone, replacing any previous one and resetting the
 *  attempt counter. */
export async function storeOtp(phone: string, otp: string): Promise<void> {
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + TTL_MS);

  try {
    await db
      .insert(otpCodesTable)
      .values({ phone, otpHash, attempts: 0, expiresAt })
      .onConflictDoUpdate({
        target: otpCodesTable.phone,
        set: { otpHash, attempts: 0, expiresAt, createdAt: new Date() },
      });

    // Replaces the old setInterval purge, which never ran reliably on a
    // runtime that freezes instances between invocations.
    await db.delete(otpCodesTable).where(lt(otpCodesTable.expiresAt, new Date()));
    return;
  } catch (err) {
    if (!isSchemaMissing(err)) throw err;
    console.error("[auth] otp_codes is missing its new shape — run migration 0007_otp_codes_shared_store.sql");
  }

  memoryStore.set(phone, { otpHash, expiresAt: Date.now() + TTL_MS, attempts: 0 });
}

/**
 * Check a code and consume it on success.
 *
 * The attempt counter is incremented in the same statement that reads the row,
 * so concurrent guesses cannot each see the pre-increment value.
 */
export async function verifyOtp(phone: string, provided: string): Promise<OtpVerdict> {
  try {
    const [row] = await db
      .update(otpCodesTable)
      .set({ attempts: sql`${otpCodesTable.attempts} + 1` })
      .where(and(eq(otpCodesTable.phone, phone), sql`${otpCodesTable.expiresAt} > now()`))
      .returning({ otpHash: otpCodesTable.otpHash, attempts: otpCodesTable.attempts });

    if (!row) return "invalid";

    if (row.attempts > MAX_OTP_ATTEMPTS) {
      await db.delete(otpCodesTable).where(eq(otpCodesTable.phone, phone));
      return "too_many_attempts";
    }

    if (!constantTimeEquals(hashOtp(provided), row.otpHash)) return "invalid";

    await db.delete(otpCodesTable).where(eq(otpCodesTable.phone, phone));
    return "ok";
  } catch (err) {
    if (!isSchemaMissing(err)) throw err;
  }

  const stored = memoryStore.get(phone);
  if (!stored || Date.now() > stored.expiresAt) {
    memoryStore.delete(phone);
    return "invalid";
  }

  stored.attempts += 1;
  if (stored.attempts > MAX_OTP_ATTEMPTS) {
    memoryStore.delete(phone);
    return "too_many_attempts";
  }

  if (!constantTimeEquals(hashOtp(provided), stored.otpHash)) return "invalid";

  memoryStore.delete(phone);
  return "ok";
}

/** Test seam — clears the in-memory fallback between cases. */
export function __resetMemoryOtpStore(): void {
  memoryStore.clear();
}
