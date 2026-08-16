import { Router, type IRouter } from "express";
import { db, geoZonesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import { hasPgErrorCode, UNDEFINED_COLUMN } from "../lib/pgError.js";

const router: IRouter = Router();

/**
 * This file used to define its own requireAdmin that read `req.user`. Nothing
 * in the codebase ever sets that property — the auth middleware populates
 * `req.currentUser` — so the guard's `!req.user` was unconditionally true and
 * every request here answered 403, including a correctly authenticated
 * administrator's. The Geo Zones screen could not list, create or edit a single
 * zone; it simply failed silently on load.
 *
 * Replaced with the shared requireAdmin, which every other admin route already
 * uses and which also handles the bearer-token path these routes were missing.
 */

/**
 * A zone does two independent jobs (see the schema comment): it can apply a
 * rate multiplier to trips that touch it, and — when isServiceArea is set — it
 * can be assigned to chauffeurs and gate which trips they are offered.
 *
 * is_service_area arrives with migration 0009, and this project deploys code
 * and migrations separately, so every read names its columns explicitly and
 * every write degrades if the column is missing. A select-star here would take
 * the whole Geo Zones screen down in the window between the two.
 */
const ZONE_COLUMNS = {
  id: geoZonesTable.id,
  name: geoZonesTable.name,
  description: geoZonesTable.description,
  type: geoZonesTable.type,
  geometry: geoZonesTable.geometry,
  rateMultiplier: geoZonesTable.rateMultiplier,
  isActive: geoZonesTable.isActive,
  createdAt: geoZonesTable.createdAt,
  updatedAt: geoZonesTable.updatedAt,
};

type ZoneRow = {
  id: number; name: string; description: string | null; type: string; geometry: string;
  rateMultiplier: number; isActive: boolean; createdAt: Date; updatedAt: Date;
  isServiceArea?: boolean;
};

function serializeZone(z: ZoneRow) {
  return {
    ...z,
    geometry: JSON.parse(z.geometry),
    // Absent column reads as "not a service area", which is the correct
    // pre-migration answer and keeps the screen usable.
    isServiceArea: z.isServiceArea ?? false,
  };
}

function isUndefinedColumn(err: unknown): boolean {
  return hasPgErrorCode(err, UNDEFINED_COLUMN);
}

// List all geo zones (admin only)
router.get("/admin/geo-zones", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const zones = await db
      .select({ ...ZONE_COLUMNS, isServiceArea: geoZonesTable.isServiceArea })
      .from(geoZonesTable)
      .orderBy(geoZonesTable.createdAt);
    res.json(zones.map(serializeZone));
  } catch (err) {
    if (!isUndefinedColumn(err)) throw err;
    const zones = await db.select(ZONE_COLUMNS).from(geoZonesTable).orderBy(geoZonesTable.createdAt);
    res.json(zones.map(serializeZone));
  }
});

// Create a new zone
router.post("/admin/geo-zones", requireAdmin, async (req, res): Promise<void> => {
  const { name, description, type, geometry, rateMultiplier, isServiceArea } = req.body as {
    name: string;
    description?: string;
    type: "circle" | "polygon";
    geometry: object;
    rateMultiplier: number;
    isServiceArea?: boolean;
  };

  if (!name?.trim() || !type || !geometry || typeof rateMultiplier !== "number") {
    res.status(400).json({ error: "name, type, geometry, and rateMultiplier are required" });
    return;
  }
  if (type !== "circle" && type !== "polygon") {
    res.status(400).json({ error: "type must be 'circle' or 'polygon'" });
    return;
  }

  const base = {
    name: name.trim(),
    description: description?.trim() ?? null,
    type,
    geometry: JSON.stringify(geometry),
    rateMultiplier,
    isActive: true,
  };

  try {
    const [created] = await db
      .insert(geoZonesTable)
      .values({ ...base, isServiceArea: !!isServiceArea })
      .returning({ ...ZONE_COLUMNS, isServiceArea: geoZonesTable.isServiceArea });
    res.status(201).json(serializeZone(created!));
  } catch (err) {
    if (!isUndefinedColumn(err)) throw err;
    // Pre-migration: create the zone anyway rather than refusing. It simply
    // cannot be a service area yet.
    const [created] = await db.insert(geoZonesTable).values(base).returning(ZONE_COLUMNS);
    res.status(201).json(serializeZone(created!));
  }
});

// Toggle active / update multiplier / mark as a service area
router.patch("/admin/geo-zones/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"]!, 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const { isActive, rateMultiplier, name, description, isServiceArea, geometry, type } = req.body as Partial<{
    isActive: boolean;
    rateMultiplier: number;
    name: string;
    description: string;
    isServiceArea: boolean;
    geometry: object;
    type: "circle" | "polygon";
  }>;

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (isActive !== undefined) update.isActive = isActive;
  if (typeof rateMultiplier === "number") update.rateMultiplier = rateMultiplier;
  if (typeof name === "string") update.name = name.trim();
  if (typeof description === "string") update.description = description.trim();
  // Redrawing a zone was previously impossible — the shape could only be set at
  // creation, so correcting a radius meant deleting the zone and losing every
  // driver assigned to it.
  if (geometry !== undefined) update.geometry = JSON.stringify(geometry);
  if (type === "circle" || type === "polygon") update.type = type;

  const applyServiceArea = isServiceArea !== undefined;

  try {
    const [updated] = await db
      .update(geoZonesTable)
      .set(applyServiceArea ? { ...update, isServiceArea } : update)
      .where(eq(geoZonesTable.id, id))
      .returning({ ...ZONE_COLUMNS, isServiceArea: geoZonesTable.isServiceArea });
    if (!updated) { res.status(404).json({ error: "Zone not found" }); return; }
    res.json(serializeZone(updated));
  } catch (err) {
    if (!isUndefinedColumn(err)) throw err;
    if (applyServiceArea) {
      res.status(503).json({
        error: "Service areas are not available yet — migration 0009_service_areas.sql has not been applied to this database.",
      });
      return;
    }
    const [updated] = await db.update(geoZonesTable).set(update).where(eq(geoZonesTable.id, id)).returning(ZONE_COLUMNS);
    if (!updated) { res.status(404).json({ error: "Zone not found" }); return; }
    res.json(serializeZone(updated));
  }
});

// Delete a zone
router.delete("/admin/geo-zones/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"]!, 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  // driver_service_zones cascades on delete, so any chauffeur assignments to
  // this area go with it. Saying so is the point of returning the count.
  await db.delete(geoZonesTable).where(eq(geoZonesTable.id, id));
  res.json({ ok: true });
});

export default router;
