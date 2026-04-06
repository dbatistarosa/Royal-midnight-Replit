import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, promoCodesTable } from "@workspace/db";
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

router.get("/promos", async (_req, res): Promise<void> => {
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

router.post("/promos", async (req, res): Promise<void> => {
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

router.post("/promos/validate", async (req, res): Promise<void> => {
  const parsed = ValidatePromoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { code, bookingAmount } = parsed.data;
  const [promo] = await db.select().from(promoCodesTable).where(eq(promoCodesTable.code, code.toUpperCase()));

  if (!promo || !promo.isActive) {
    res.json({ valid: false, discountAmount: null, finalAmount: null, message: "Invalid or expired promo code" });
    return;
  }

  if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
    res.json({ valid: false, discountAmount: null, finalAmount: null, message: "Promo code has expired" });
    return;
  }

  if (promo.maxUses && promo.usedCount >= promo.maxUses) {
    res.json({ valid: false, discountAmount: null, finalAmount: null, message: "Promo code usage limit reached" });
    return;
  }

  const minAmount = promo.minBookingAmount ? parseFloat(promo.minBookingAmount) : 0;
  if (bookingAmount < minAmount) {
    res.json({ valid: false, discountAmount: null, finalAmount: null, message: `Minimum booking amount of $${minAmount} required` });
    return;
  }

  const discountValue = parseFloat(promo.discountValue ?? "0");
  let discountAmount: number;
  if (promo.discountType === "percentage") {
    discountAmount = Math.round(bookingAmount * (discountValue / 100) * 100) / 100;
  } else {
    discountAmount = Math.min(discountValue, bookingAmount);
  }

  const finalAmount = Math.round((bookingAmount - discountAmount) * 100) / 100;
  res.json({ valid: true, discountAmount, finalAmount, message: `${promo.description} applied` });
});

router.patch("/promos/:id", async (req, res): Promise<void> => {
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

router.delete("/promos/:id", async (req, res): Promise<void> => {
  const params = DeletePromoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(promoCodesTable).where(eq(promoCodesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
