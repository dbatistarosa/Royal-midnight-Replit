import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, promoCodesTable } from "@workspace/db";
import { requireAdmin } from "../middleware/auth.js";
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
 *  claims (CN-001). This is read-only — it does not redeem the code. */
export async function evaluatePromoCode(
  rawCode: string,
  bookingAmount: number,
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

router.post("/promos/validate", async (req, res): Promise<void> => {
  const parsed = ValidatePromoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { code, bookingAmount } = parsed.data;
  const result = await evaluatePromoCode(code, bookingAmount);
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
