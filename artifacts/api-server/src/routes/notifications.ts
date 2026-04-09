import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import {
  ListNotificationsQueryParams,
  ListNotificationsResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListNotificationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== parsed.data.userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, parsed.data.userId));

  res.json(
    ListNotificationsResponse.parse(
      notifications.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))
    )
  );
});

router.patch("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && existing.userId !== caller.userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [notification] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.id, params.data.id))
    .returning();

  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.json(
    MarkNotificationReadResponse.parse({ ...notification, createdAt: notification.createdAt.toISOString() })
  );
});

export default router;
