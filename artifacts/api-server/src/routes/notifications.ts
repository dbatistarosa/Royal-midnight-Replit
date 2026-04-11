import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth.js";
import {
  ListNotificationsQueryParams,
  ListNotificationsResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListNotificationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Users may only fetch their own notifications; admins may fetch any
  if (req.currentUser!.role !== "admin" && parsed.data.userId !== req.currentUser!.userId) {
    res.status(403).json({ error: "Forbidden" });
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

  // Fetch first to verify ownership before updating
  const [existing] = await db.select().from(notificationsTable).where(eq(notificationsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  if (req.currentUser!.role !== "admin" && existing.userId !== req.currentUser!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [notification] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.id, params.data.id))
    .returning();

  res.json(
    MarkNotificationReadResponse.parse({ ...notification, createdAt: notification.createdAt.toISOString() })
  );
});

export default router;
