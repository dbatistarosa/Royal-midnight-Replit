import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, driversTable } from "@workspace/db";
import {
  ListDriversQueryParams,
  ListDriversResponse,
  CreateDriverBody,
  GetDriverParams,
  GetDriverResponse,
  UpdateDriverParams,
  UpdateDriverBody,
  UpdateDriverResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/drivers", async (req, res): Promise<void> => {
  const parsed = ListDriversQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const drivers = await db
    .select()
    .from(driversTable)
    .where(parsed.data.status ? eq(driversTable.status, parsed.data.status) : undefined);

  res.json(
    ListDriversResponse.parse(
      drivers.map((d) => ({
        ...d,
        rating: d.rating != null ? parseFloat(d.rating) : null,
        createdAt: d.createdAt.toISOString(),
      }))
    )
  );
});

router.post("/drivers", async (req, res): Promise<void> => {
  const parsed = CreateDriverBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [driver] = await db.insert(driversTable).values(parsed.data).returning();
  res.status(201).json(
    GetDriverResponse.parse({
      ...driver,
      rating: driver.rating != null ? parseFloat(driver.rating) : null,
      createdAt: driver.createdAt.toISOString(),
    })
  );
});

router.get("/drivers/:id", async (req, res): Promise<void> => {
  const params = GetDriverParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, params.data.id));
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  res.json(
    GetDriverResponse.parse({
      ...driver,
      rating: driver.rating != null ? parseFloat(driver.rating) : null,
      createdAt: driver.createdAt.toISOString(),
    })
  );
});

router.patch("/drivers/:id", async (req, res): Promise<void> => {
  const params = UpdateDriverParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateDriverBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.status != null) updateData.status = parsed.data.status;
  if (parsed.data.rating != null) updateData.rating = String(parsed.data.rating);

  const [driver] = await db
    .update(driversTable)
    .set(updateData)
    .where(eq(driversTable.id, params.data.id))
    .returning();

  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  res.json(
    UpdateDriverResponse.parse({
      ...driver,
      rating: driver.rating != null ? parseFloat(driver.rating) : null,
      createdAt: driver.createdAt.toISOString(),
    })
  );
});

export default router;
