import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, fixedRoutesTable, extraServicesTable } from "@workspace/db";
import { hasPgErrorCode, UNDEFINED_COLUMN } from "../lib/pgError.js";
import type { AirportPriceEntry } from "@workspace/db";
import { requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

function serializeRoute(r: typeof fixedRoutesTable.$inferSelect) {
  return {
    ...r,
    fixedPrice: parseFloat(String(r.fixedPrice)),
    airportsJson: r.airportsJson ?? null,
  };
}

// ── Fixed Routes (hotel ↔ airport pricing) ───────────────────────────────────

// Public — used by the quote engine to find active routes.
// Returns all active routes (both legacy and airportsJson format).
router.get("/fixed-routes", async (_req, res): Promise<void> => {
  const routes = await db.select().from(fixedRoutesTable)
    .where(eq(fixedRoutesTable.isActive, true))
    .orderBy(fixedRoutesTable.originName);
  res.json(routes.map(serializeRoute));
});

router.get("/admin/fixed-routes", requireAdmin, async (_req, res): Promise<void> => {
  const routes = await db.select().from(fixedRoutesTable).orderBy(fixedRoutesTable.originName);
  res.json(routes.map(serializeRoute));
});

router.post("/admin/fixed-routes", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const { originName, originAddress } = body;
  if (!originName || !originAddress) {
    res.status(400).json({ error: "originName and originAddress are required" });
    return;
  }

  // New multi-airport format
  if (body.airportsJson) {
    const airportsJson = body.airportsJson as AirportPriceEntry[];
    if (!Array.isArray(airportsJson) || airportsJson.length === 0) {
      res.status(400).json({ error: "airportsJson must be a non-empty array" });
      return;
    }
    const [r] = await db.insert(fixedRoutesTable).values({
      originName: String(originName),
      originAddress: String(originAddress),
      destinationCode: "all",
      destinationName: "Multiple",
      vehicleClass: "all",
      fixedPrice: "0",
      airportsJson,
      isActive: body.isActive !== false,
    }).returning();
    res.status(201).json(serializeRoute(r));
    return;
  }

  // Legacy single-airport single-class format
  const { destinationCode, destinationName, vehicleClass, fixedPrice } = body;
  if (!destinationCode || !destinationName || !fixedPrice) {
    res.status(400).json({ error: "destinationCode, destinationName, and fixedPrice are required" });
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
  res.status(201).json(serializeRoute(r));
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
  if (body.airportsJson !== undefined) updateData.airportsJson = body.airportsJson;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  const [r] = await db.update(fixedRoutesTable).set(updateData).where(eq(fixedRoutesTable.id, id)).returning();
  if (!r) { res.status(404).json({ error: "Route not found" }); return; }
  res.json(serializeRoute(r));
});

router.delete("/admin/fixed-routes/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(fixedRoutesTable).where(eq(fixedRoutesTable.id, id));
  res.sendStatus(204);
});

// ── Extra Services (paid add-ons: pets, car seat, champagne, etc.) ─────────────

/**
 * paid_to_driver arrives with migration 0011, and this project deploys code and
 * migrations separately. Naming the columns rather than select-star means the
 * Extras screen keeps working in the window between the two — a select-star
 * would throw undefined_column and take both endpoints down, which is exactly
 * how adding a column to bookings took production down previously.
 */
const EXTRA_COLUMNS = {
  id: extraServicesTable.id,
  name: extraServicesTable.name,
  description: extraServicesTable.description,
  category: extraServicesTable.category,
  price: extraServicesTable.price,
  icon: extraServicesTable.icon,
  isActive: extraServicesTable.isActive,
  sortOrder: extraServicesTable.sortOrder,
  createdAt: extraServicesTable.createdAt,
};

type ExtraOut = Record<string, unknown> & { price: unknown; paidToDriver?: boolean };
const serializeExtra = (e: ExtraOut) => ({
  ...e,
  price: parseFloat(String(e.price)),
  paidToDriver: e.paidToDriver ?? false,
});

async function listExtras(onlyActive: boolean) {
  const order = [asc(extraServicesTable.sortOrder), asc(extraServicesTable.name)] as const;
  try {
    const q = db.select({ ...EXTRA_COLUMNS, paidToDriver: extraServicesTable.paidToDriver }).from(extraServicesTable);
    const rows = onlyActive
      ? await q.where(eq(extraServicesTable.isActive, true)).orderBy(...order)
      : await q.orderBy(...order);
    return rows.map(serializeExtra);
  } catch (err) {
    if (!hasPgErrorCode(err, UNDEFINED_COLUMN)) throw err;
    const q = db.select(EXTRA_COLUMNS).from(extraServicesTable);
    const rows = onlyActive
      ? await q.where(eq(extraServicesTable.isActive, true)).orderBy(...order)
      : await q.orderBy(...order);
    return rows.map(serializeExtra);
  }
}

router.get("/extras", async (_req, res): Promise<void> => {
  res.json(await listExtras(true));
});

router.get("/admin/extras", requireAdmin, async (_req, res): Promise<void> => {
  res.json(await listExtras(false));
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
  if (body.paidToDriver !== undefined) updateData.paidToDriver = !!body.paidToDriver;
  try {
    const [e] = await db.update(extraServicesTable).set(updateData).where(eq(extraServicesTable.id, id))
      .returning({ ...EXTRA_COLUMNS, paidToDriver: extraServicesTable.paidToDriver });
    if (!e) { res.status(404).json({ error: "Extra not found" }); return; }
    res.json(serializeExtra(e));
  } catch (err) {
    if (!hasPgErrorCode(err, UNDEFINED_COLUMN)) throw err;
    if (body.paidToDriver !== undefined) {
      res.status(503).json({ error: "Driver payout on extras is not available yet — migration 0011 has not been applied to this database." });
      return;
    }
    delete updateData.paidToDriver;
    const [e] = await db.update(extraServicesTable).set(updateData).where(eq(extraServicesTable.id, id)).returning(EXTRA_COLUMNS);
    if (!e) { res.status(404).json({ error: "Extra not found" }); return; }
    res.json(serializeExtra(e));
  }
});

router.delete("/admin/extras/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(extraServicesTable).where(eq(extraServicesTable.id, id));
  res.sendStatus(204);
});

export default router;
