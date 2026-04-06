import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pricingRulesTable } from "@workspace/db";
import { requireAdmin } from "../middleware/auth.js";
import {
  ListPricingRulesResponse,
  CreatePricingRuleBody,
  UpdatePricingRuleParams,
  UpdatePricingRuleBody,
  UpdatePricingRuleResponse,
  DeletePricingRuleParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseRule(r: typeof pricingRulesTable.$inferSelect) {
  return {
    ...r,
    baseFare: parseFloat(r.baseFare ?? "0"),
    ratePerMile: parseFloat(r.ratePerMile ?? "0"),
    airportSurcharge: parseFloat(r.airportSurcharge ?? "0"),
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/pricing", async (_req, res): Promise<void> => {
  const rules = await db.select().from(pricingRulesTable);
  res.json(ListPricingRulesResponse.parse(rules.map(parseRule)));
});

router.post("/pricing", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreatePricingRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [rule] = await db
    .insert(pricingRulesTable)
    .values({
      ...parsed.data,
      baseFare: String(parsed.data.baseFare),
      ratePerMile: String(parsed.data.ratePerMile),
      airportSurcharge: String(parsed.data.airportSurcharge),
    })
    .returning();

  res.status(201).json(parseRule(rule));
});

router.patch("/pricing/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdatePricingRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePricingRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.baseFare != null) updateData.baseFare = String(parsed.data.baseFare);
  if (parsed.data.ratePerMile != null) updateData.ratePerMile = String(parsed.data.ratePerMile);
  if (parsed.data.airportSurcharge != null) updateData.airportSurcharge = String(parsed.data.airportSurcharge);
  if (parsed.data.isActive != null) updateData.isActive = parsed.data.isActive;

  const [rule] = await db
    .update(pricingRulesTable)
    .set(updateData)
    .where(eq(pricingRulesTable.id, params.data.id))
    .returning();

  if (!rule) {
    res.status(404).json({ error: "Pricing rule not found" });
    return;
  }

  res.json(UpdatePricingRuleResponse.parse(parseRule(rule)));
});

router.delete("/pricing/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeletePricingRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(pricingRulesTable).where(eq(pricingRulesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
