import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, vehiclesTable, vehicleCatalogTable } from "@workspace/db";
import { requireAdmin } from "../middleware/auth.js";
import {
  ListVehiclesQueryParams,
  ListVehiclesResponse,
  CreateVehicleBody,
  GetVehicleParams,
  GetVehicleResponse,
  UpdateVehicleParams,
  UpdateVehicleBody,
  UpdateVehicleResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/vehicles", async (req, res): Promise<void> => {
  const parsed = ListVehiclesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions = [];
  if (parsed.data.available != null) {
    conditions.push(eq(vehiclesTable.isAvailable, parsed.data.available));
  }
  if (parsed.data.vehicleClass != null) {
    conditions.push(eq(vehiclesTable.vehicleClass, parsed.data.vehicleClass));
  }

  const vehicles = await db
    .select()
    .from(vehiclesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json(ListVehiclesResponse.parse(vehicles.map(v => ({
    ...v,
    createdAt: v.createdAt.toISOString(),
  }))));
});

router.post("/vehicles", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateVehicleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [vehicle] = await db.insert(vehiclesTable).values(parsed.data).returning();
  res.status(201).json(GetVehicleResponse.parse({ ...vehicle, createdAt: vehicle.createdAt.toISOString() }));
});

router.get("/vehicles/:id", async (req, res): Promise<void> => {
  const params = GetVehicleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, params.data.id));
  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  res.json(GetVehicleResponse.parse({ ...vehicle, createdAt: vehicle.createdAt.toISOString() }));
});

router.patch("/vehicles/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateVehicleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateVehicleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.isAvailable != null) updateData.isAvailable = parsed.data.isAvailable;
  if (parsed.data.color != null) updateData.color = parsed.data.color;
  if (parsed.data.imageUrl !== undefined) updateData.imageUrl = parsed.data.imageUrl;

  const [vehicle] = await db
    .update(vehiclesTable)
    .set(updateData)
    .where(eq(vehiclesTable.id, params.data.id))
    .returning();

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  res.json(UpdateVehicleResponse.parse({ ...vehicle, createdAt: vehicle.createdAt.toISOString() }));
});

// Public: GET /vehicle-catalog — used by driver onboarding to build dropdowns
router.get("/vehicle-catalog", async (_req, res): Promise<void> => {
  const entries = await db
    .select()
    .from(vehicleCatalogTable)
    .where(eq(vehicleCatalogTable.isActive, true))
    .orderBy(vehicleCatalogTable.make, vehicleCatalogTable.model);
  res.json(entries);
});

export default router;
