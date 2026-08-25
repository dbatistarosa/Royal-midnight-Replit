import { Router, type IRouter } from "express";
import { eq, and, ne, sql } from "drizzle-orm";
import { db, promoCodesTable, bookingsTable } from "@workspace/db";
import { requireAdmin, optionalAuth } from "../middleware/auth.js";
import { promoLimiter } from "../lib/rateLimit.js";
import {
  ListPromosResponse,
  CreatePromoBody,
  UpdatePromoParams,
  UpdatePromoBody,
  UpdatePromoResponse,
  DeletePromoParams,
  ValidatePromoBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/promos", requireAdmin, async (_req, res): Promise<void> => {
  const promos = await db.select().from(promoCodesTable);
  res.json(
    ListPromosResponse.parse(
      promos.map((p) => ({
        ...p,
        discountValue: parseFloat(p.discountValue ?? "0"),
        minBookingAmount: p.minBookingAmount != null ? parseFloat(p.minBookingAmount) : null,
        expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
      }))
    )
  );
});

router.post("/promos", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreatePromoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [promo] = await db
    .insert(promoCodesTable)
    .values({
      ...parsed.data,
      discountValue: String(parsed.data.discountValue),
      minBookingAmount: parsed.data.minBookingAmount != null ? String(parsed.data.minBookingAmount) : null,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    })
    .returning();

  res.status(201).json({
    ...promo,
    discountValue: parseFloat(promo.discountValue ?? "0"),
    minBookingAmount: promo.minBookingAmount != null ? parseFloat(promo.minBookingAmount) : null,
    expiresAt: promo.expiresAt ? promo.expiresAt.toISOString() : null,
    createdAt: promo.createdAt.toISOString(),
  });
});

export interface PromoEvaluation {
  valid: boolean;
  /** Normalised (upper-cased) code, only set when valid. */
  code: string | null;
  discountAmount: number | null;
  finalAmount: number | null;
  message: string;
}

/** Evaluate a promo code against a booking amount.
 *
 *  Extracted from the POST /promos/validate handler so booking creation can
 *  re-derive the discount server-side instead of trusting the amount the client
 *  claims (CN-001). This is read-only — it does not redeem the code.
 *
 *  `userId` is what makes a per-person limit enforceable. Without it the only
 *  cap available is the global one, and "one per customer" degrades to "one in
 *  total, for whoever gets there first". */
export async function evaluatePromoCode(
  rawCode: string,
  bookingAmount: number,
  userId?: number | null,
): Promise<PromoEvaluation> {
  const invalid = (message: string): PromoEvaluation => ({
    valid: false, code: null, discountAmount: null, finalAmount: null, message,
  });

  const code = rawCode.trim().toUpperCase();
  if (!code) return invalid("Invalid or expired promo code");

  const [promo] = await db.select().from(promoCodesTable).where(eq(promoCodesTable.code, code));

  if (!promo || !promo.isActive) return invalid("Invalid or expired promo code");
  if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) return invalid("Promo code has expired");
  if (promo.maxUses && promo.usedCount >= promo.maxUses) return invalid("Promo code usage limit reached");

  // Per-person cap. Counted from this passenger's own bookings carrying the
  // code — the booking row IS the record of a redemption, so a separate
  // redemptions table would only be a second thing to keep in step.
  //
  // A code with this set cannot be honoured anonymously: there is no identity
  // to count against, and quietly allowing it would mean the limit is bypassed
  // by simply not signing in.
  const perUser = promo.maxUsesPerUser ?? null;
  if (perUser != null && perUser > 0) {
    if (userId == null) {
      return invalid("Sign in to use this promo code — it is limited per customer.");
    }
    // Excludes cancelled bookings: this cap is meant to be "you've redeemed
    // this code N times," not "you've ever typed this code into a booking
    // that didn't go through" — without the status filter, a cancelled trip
    // permanently burned one of a customer's uses with nothing to show for it.
    const [row] = await db
      .select({ used: sql<number>`count(*)::int` })
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.promoCode, code),
          eq(bookingsTable.userId, userId),
          ne(bookingsTable.status, "cancelled"),
        ),
      );
    const usedByThisUser = row?.used ?? 0;
    if (usedByThisUser >= perUser) {
      return invalid(
        perUser === 1
          ? "You have already used this promo code."
          : `You have already used this promo code ${perUser} times.`,
      );
    }
  }

  const minAmount = promo.minBookingAmount ? parseFloat(promo.minBookingAmount) : 0;
  if (bookingAmount < minAmount) {
    return invalid(`Minimum booking amount of $${minAmount} required`);
  }

  const discountValue = parseFloat(promo.discountValue ?? "0");
  const discountAmount = promo.discountType === "percentage"
    ? Math.round(bookingAmount * (discountValue / 100) * 100) / 100
    : Math.min(discountValue, bookingAmount);

  return {
    valid: true,
    code,
    discountAmount,
    finalAmount: Math.round((bookingAmount - discountAmount) * 100) / 100,
    message: `${promo.description} applied`,
  };
}

/**
 * Undo a promo redemption when the booking that used it is cancelled.
 *
 * `usedCount` is a real persistent counter (unlike the per-user cap above,
 * which is derived live from non-cancelled bookings) — it was incremented on
 * creation and never released, so a capped-supply code could be exhausted by
 * cancellations alone with nothing actually redeemed. Floored at 0 with a SQL
 * GREATEST so a decrement racing a concurrent read can never drive it
 * negative. Never throws: called from fire-and-forget cancellation paths
 * where a failure here must not block or fail the cancellation itself.
 */
export async function releasePromoUsage(
  code: string | null | undefined,
  log?: { warn: (obj: object, msg: string) => void },
): Promise<void> {
  if (!code) return;
  try {
    await db
      .update(promoCodesTable)
      .set({ usedCount: sql`greatest(${promoCodesTable.usedCount} - 1, 0)` })
      .where(eq(promoCodesTable.code, code));
  } catch (err) {
    log?.warn(
      { code, err: (err as Error).message },
      "promo_usage_release_failed",
    );
  }
}

// Brute-forcing short promo codes costs the attacker nothing without this.
// optionalAuth so a signed-in passenger is told the truth about a per-person
// limit here, at the point they type the code, instead of being accepted on the
// booking form and rejected when the server re-derives the discount.
router.post("/promos/validate", promoLimiter(), optionalAuth, async (req, res): Promise<void> => {
  const parsed = ValidatePromoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { code, bookingAmount } = parsed.data;
  const result = await evaluatePromoCode(code, bookingAmount, req.currentUser?.userId ?? null);
  res.json({
    valid: result.valid,
    discountAmount: result.discountAmount,
    finalAmount: result.finalAmount,
    message: result.message,
  });
});

router.patch("/promos/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdatePromoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePromoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.isActive != null) updateData.isActive = parsed.data.isActive;
  if (parsed.data.expiresAt !== undefined) updateData.expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (parsed.data.description != null) updateData.description = parsed.data.description;
  // `!== undefined`, not `!= null`: null is a meaningful value here (it clears
  // the per-customer cap back to unlimited), so it must reach the update.
  if (parsed.data.maxUsesPerUser !== undefined) updateData.maxUsesPerUser = parsed.data.maxUsesPerUser;

  const [promo] = await db
    .update(promoCodesTable)
    .set(updateData)
    .where(eq(promoCodesTable.id, params.data.id))
    .returning();

  if (!promo) {
    res.status(404).json({ error: "Promo not found" });
    return;
  }

  res.json(
    UpdatePromoResponse.parse({
      ...promo,
      discountValue: parseFloat(promo.discountValue ?? "0"),
      minBookingAmount: promo.minBookingAmount != null ? parseFloat(promo.minBookingAmount) : null,
      expiresAt: promo.expiresAt ? promo.expiresAt.toISOString() : null,
      createdAt: promo.createdAt.toISOString(),
    })
  );
});

router.delete("/promos/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeletePromoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(promoCodesTable).where(eq(promoCodesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
