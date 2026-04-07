import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, savedAddressesTable } from "@workspace/db";
import {
  ListAddressesQueryParams,
  ListAddressesResponse,
  CreateAddressBody,
  DeleteAddressParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/addresses", async (req, res): Promise<void> => {
  const parsed = ListAddressesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const addresses = await db
    .select()
    .from(savedAddressesTable)
    .where(eq(savedAddressesTable.userId, parsed.data.userId));

  res.json(
    ListAddressesResponse.parse(
      addresses.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))
    )
  );
});

router.post("/addresses", async (req, res): Promise<void> => {
  const parsed = CreateAddressBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [address] = await db.insert(savedAddressesTable).values(parsed.data).returning();
  res.status(201).json({ ...address, createdAt: address.createdAt.toISOString() });
});

router.patch("/addresses/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] || "0", 10);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const label = (req.body?.label as string | undefined)?.trim();
  const address = (req.body?.address as string | undefined)?.trim();
  if (!label && !address) {
    res.status(400).json({ error: "label or address required" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (label) updateData.label = label;
  if (address) updateData.address = address;

  const [updated] = await db
    .update(savedAddressesTable)
    .set(updateData)
    .where(eq(savedAddressesTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Address not found" });
    return;
  }

  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

router.delete("/addresses/:id", async (req, res): Promise<void> => {
  const params = DeleteAddressParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(savedAddressesTable).where(eq(savedAddressesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
