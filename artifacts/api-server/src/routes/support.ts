import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, supportTicketsTable } from "@workspace/db";
import {
  ListTicketsQueryParams,
  ListTicketsResponse,
  CreateTicketBody,
  UpdateTicketParams,
  UpdateTicketBody,
  UpdateTicketResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/support", async (req, res): Promise<void> => {
  const parsed = ListTicketsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions = [];
  if (parsed.data.status) conditions.push(eq(supportTicketsTable.status, parsed.data.status));
  if (parsed.data.userId != null) conditions.push(eq(supportTicketsTable.userId, parsed.data.userId));

  const tickets = await db
    .select()
    .from(supportTicketsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json(
    ListTicketsResponse.parse(
      tickets.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }))
    )
  );
});

router.post("/support", async (req, res): Promise<void> => {
  const parsed = CreateTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [ticket] = await db.insert(supportTicketsTable).values(parsed.data).returning();
  res.status(201).json({
    ...ticket,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  });
});

router.patch("/support/:id", async (req, res): Promise<void> => {
  const params = UpdateTicketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.status) updateData.status = parsed.data.status;
  if (parsed.data.priority != null) updateData.priority = parsed.data.priority;

  const [ticket] = await db
    .update(supportTicketsTable)
    .set(updateData)
    .where(eq(supportTicketsTable.id, params.data.id))
    .returning();

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  res.json(
    UpdateTicketResponse.parse({
      ...ticket,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    })
  );
});

export default router;
