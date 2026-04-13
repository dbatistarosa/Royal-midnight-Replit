import { Router, type IRouter } from "express";
import { db, geoZonesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// List all geo zones (admin only)
router.get("/admin/geo-zones", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const zones = await db.select().from(geoZonesTable).orderBy(geoZonesTable.createdAt);
  res.json(zones.map(z => ({
    ...z,
    geometry: JSON.parse(z.geometry),
  })));
});

// Create a new zone
router.post("/admin/geo-zones", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { name, description, type, geometry, rateMultiplier } = req.body as {
    name: string;
    description?: string;
    type: "circle" | "polygon";
    geometry: object;
    rateMultiplier: number;
  };

  if (!name?.trim() || !type || !geometry || typeof rateMultiplier !== "number") {
    res.status(400).json({ error: "name, type, geometry, and rateMultiplier are required" });
    return;
  }

  const [created] = await db.insert(geoZonesTable).values({
    name: name.trim(),
    description: description?.trim() ?? null,
    type,
    geometry: JSON.stringify(geometry),
    rateMultiplier,
    isActive: true,
  }).returning();

  res.status(201).json({ ...created, geometry: JSON.parse(created.geometry) });
});

// Toggle active / update multiplier
router.patch("/admin/geo-zones/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"]!, 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const { isActive, rateMultiplier, name, description } = req.body as Partial<{
    isActive: boolean;
    rateMultiplier: number;
    name: string;
    description: string;
  }>;

  const update: Partial<typeof geoZonesTable.$inferInsert> = { updatedAt: new Date() };
  if (isActive !== undefined) update.isActive = isActive;
  if (typeof rateMultiplier === "number") update.rateMultiplier = rateMultiplier;
  if (typeof name === "string") update.name = name.trim();
  if (typeof description === "string") update.description = description.trim();

  const [updated] = await db.update(geoZonesTable).set(update).where(eq(geoZonesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Zone not found" }); return; }

  res.json({ ...updated, geometry: JSON.parse(updated.geometry) });
});

// Delete a zone
router.delete("/admin/geo-zones/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"]!, 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(geoZonesTable).where(eq(geoZonesTable.id, id));
  res.json({ ok: true });
});

export default router;
