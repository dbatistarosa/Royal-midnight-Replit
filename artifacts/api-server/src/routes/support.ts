import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db, supportTicketsTable, ticketMessagesTable } from "@workspace/db";
import { requireAuth, requireAdmin, optionalAuth } from "../middleware/auth.js";
import { notifyNewSupportTicket, notifySupportReply } from "../lib/mailer.js";
import {
  ListTicketsQueryParams,
  ListTicketsResponse,
  CreateTicketBody,
  UpdateTicketParams,
  UpdateTicketBody,
  UpdateTicketResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseTicket(t: typeof supportTicketsTable.$inferSelect) {
  return {
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

router.get("/support", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListTicketsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const caller = req.currentUser!;
  const conditions = [];
  if (parsed.data.status) conditions.push(eq(supportTicketsTable.status, parsed.data.status));

  if (caller.role === "admin") {
    // Admins can filter by userId or see all
    if (parsed.data.userId != null) conditions.push(eq(supportTicketsTable.userId, parsed.data.userId));
  } else {
    // Non-admins only see their own tickets
    conditions.push(eq(supportTicketsTable.userId, caller.userId));
  }

  const tickets = await db
    .select()
    .from(supportTicketsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json(ListTicketsResponse.parse(tickets.map(parseTicket)));
});

// optionalAuth: logged-in users get their ticket auto-linked; guests can still submit
router.post("/support", optionalAuth, async (req, res): Promise<void> => {
  const parsed = CreateTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // userId is never taken from the body.
  //
  // The authenticated branch already overrode it, but the anonymous branch
  // passed `parsed.data` through untouched — and CreateTicketBody accepts a
  // `userId`. So an unauthenticated POST to /api/support with `userId: 6`
  // injected a ticket into that passenger's support list, under an
  // attacker-chosen name, email and message, which then rendered as theirs on
  // both the admin board and their own Support screen.
  const insertData = { ...parsed.data, userId: req.currentUser?.userId ?? null };

  const [ticket] = await db.insert(supportTicketsTable).values(insertData).returning();
  res.status(201).json(parseTicket(ticket));

  // Tell someone. Support has been a silent inbox: a ticket landed in the
  // table and nothing anywhere announced it, so the only way to find out a
  // customer had written in was for an administrator to open the screen and
  // look. Fire-and-forget — a failed notification must not fail the ticket.
  void notifyNewSupportTicket({
    id: ticket.id,
    name: ticket.name,
    email: ticket.email,
    subject: ticket.subject,
    message: ticket.message,
    priority: ticket.priority,
  }).catch(err => console.error("[support] new-ticket notification failed:", err));
});

router.patch("/support/:id", requireAdmin, async (req, res): Promise<void> => {
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

  res.json(UpdateTicketResponse.parse(parseTicket(ticket)));
});

// GET /support/:id/messages — fetch thread for a ticket
router.get("/support/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] || "0", 10);
  if (!id) {
    res.status(400).json({ error: "Invalid ticket id" });
    return;
  }

  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && ticket.userId !== caller.userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const messages = await db
    .select()
    .from(ticketMessagesTable)
    .where(eq(ticketMessagesTable.ticketId, id))
    .orderBy(asc(ticketMessagesTable.createdAt));

  res.json(messages.map(m => ({ ...m, createdAt: m.createdAt.toISOString() })));
});

// POST /support/:id/messages — post a reply to a ticket
router.post("/support/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] || "0", 10);
  if (!id) {
    res.status(400).json({ error: "Invalid ticket id" });
    return;
  }

  const message = (req.body?.message as string | undefined)?.trim();
  if (!message || message.length === 0) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && ticket.userId !== caller.userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (ticket.status === "closed" && caller.role !== "admin") {
    res.status(400).json({ error: "Cannot reply to a closed ticket" });
    return;
  }

  const authorRole = caller.role === "admin" ? "admin" : "passenger";

  const [msg] = await db
    .insert(ticketMessagesTable)
    .values({ ticketId: id, userId: caller.userId, authorRole, message })
    .returning();

  // Move ticket to in_progress when admin replies
  if (authorRole === "admin" && ticket.status === "open") {
    await db.update(supportTicketsTable).set({ status: "in_progress" }).where(eq(supportTicketsTable.id, id));
  }

  res.status(201).json({ ...msg, createdAt: msg.createdAt.toISOString() });

  // The admin screen's reply box says "Type your reply to the passenger" and
  // nothing was ever sent to the passenger — the reply sat in ticket_messages
  // until they happened to reopen the Support page. Same in reverse: a
  // passenger's follow-up reached nobody.
  void notifySupportReply({
    ticketId: id,
    subject: ticket.subject,
    message,
    fromAdmin: authorRole === "admin",
    passengerName: ticket.name,
    passengerEmail: ticket.email,
  }).catch(err => console.error("[support] reply notification failed:", err));
});

export default router;
