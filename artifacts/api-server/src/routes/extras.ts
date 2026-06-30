import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, fixedRoutesTable, extraServicesTable } from "@workspace/db";
import { requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

// ── Fixed Routes (hotel ↔ airport pricing) ───────────────────────────────────

router.get("/fixed-routes", async (_req, res): Promise<void> => {
  const routes = await db.select().from(fixedRoutesTable)
    .where(eq(fixedRoutesTable.isActive, true))
    .orderBy(fixedRoutesTable.originName);
  res.json(routes.map(r => ({ ...r, fixedPrice: parseFloat(String(r.fixedPrice)) })));
});

router.get("/admin/fixed-routes", requireAdmin, async (_req, res): Promise<void> => {
  const routes = await db.select().from(fixedRoutesTable).orderBy(fixedRoutesTable.originName);
  res.json(routes.map(r => ({ ...r, fixedPrice: parseFloat(String(r.fixedPrice)) })));
});

router.post("/admin/fixed-routes", requireAdmin, async (req, res): Promise<void> => {
  const { originName, originAddress, destinationCode, destinationName, vehicleClass, fixedPrice } = req.body as Record<string, unknown>;
  if (!originName || !originAddress || !destinationCode || !destinationName || !fixedPrice) {
    res.status(400).json({ error: "originName, originAddress, destinationCode, destinationName, and fixedPrice are required" });
    return;
  }
  const [r] = await db.insert(fixedRoutesTable).values({
    originName: String(originName),
    originAddress: String(originAddress),
    destinationCode: String(destinationCode),
    destinationName: String(destinationName),
    vehicleClass: vehicleClass ? String(vehicleClass) : "business",
    fixedPrice: String(fixedPrice),
  }).returning();
  res.status(201).json({ ...r, fixedPrice: parseFloat(String(r.fixedPrice)) });
});

router.patch("/admin/fixed-routes/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = req.body as Record<string, unknown>;
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.originName) updateData.originName = body.originName;
  if (body.originAddress) updateData.originAddress = body.originAddress;
  if (body.destinationCode) updateData.destinationCode = body.destinationCode;
  if (body.destinationName) updateData.destinationName = body.destinationName;
  if (body.vehicleClass) updateData.vehicleClass = body.vehicleClass;
  if (body.fixedPrice) updateData.fixedPrice = String(body.fixedPrice);
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  const [r] = await db.update(fixedRoutesTable).set(updateData).where(eq(fixedRoutesTable.id, id)).returning();
  if (!r) { res.status(404).json({ error: "Route not found" }); return; }
  res.json({ ...r, fixedPrice: parseFloat(String(r.fixedPrice)) });
});

router.delete("/admin/fixed-routes/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(fixedRoutesTable).where(eq(fixedRoutesTable.id, id));
  res.sendStatus(204);
});

// ── Extra Services (paid add-ons: pets, car seat, champagne, etc.) ─────────────

router.get("/extras", async (_req, res): Promise<void> => {
  const extras = await db.select().from(extraServicesTable)
    .where(eq(extraServicesTable.isActive, true))
    .orderBy(asc(extraServicesTable.sortOrder), asc(extraServicesTable.name));
  res.json(extras.map(e => ({ ...e, price: parseFloat(String(e.price)) })));
});

router.get("/admin/extras", requireAdmin, async (_req, res): Promise<void> => {
  const extras = await db.select().from(extraServicesTable)
    .orderBy(asc(extraServicesTable.sortOrder), asc(extraServicesTable.name));
  res.json(extras.map(e => ({ ...e, price: parseFloat(String(e.price)) })));
});

router.post("/admin/extras", requireAdmin, async (req, res): Promise<void> => {
  const { name, description, category, price, icon, sortOrder } = req.body as Record<string, unknown>;
  if (!name || price == null) { res.status(400).json({ error: "name and price are required" }); return; }
  const [e] = await db.insert(extraServicesTable).values({
    name: String(name),
    description: description ? String(description) : null,
    category: category ? String(category) : "amenity",
    price: String(price),
    icon: icon ? String(icon) : null,
    sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
  }).returning();
  res.status(201).json({ ...e, price: parseFloat(String(e.price)) });
});

router.patch("/admin/extras/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = req.body as Record<string, unknown>;
  const updateData: Record<string, unknown> = {};
  if (body.name) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description ?? null;
  if (body.category) updateData.category = body.category;
  if (body.price != null) updateData.price = String(body.price);
  if (body.icon !== undefined) updateData.icon = body.icon ?? null;
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  const [e] = await db.update(extraServicesTable).set(updateData).where(eq(extraServicesTable.id, id)).returning();
  if (!e) { res.status(404).json({ error: "Extra not found" }); return; }
  res.json({ ...e, price: parseFloat(String(e.price)) });
});

router.delete("/admin/extras/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(extraServicesTable).where(eq(extraServicesTable.id, id));
  res.sendStatus(204);
});

export default router;
