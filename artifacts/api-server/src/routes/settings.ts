import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

// Public read of safe settings (min_booking_hours, florida_tax_rate)
router.get("/settings/public", async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = {};
  for (const row of rows) {
    // Only expose non-sensitive keys
    if (["min_booking_hours", "florida_tax_rate"].includes(row.key)) {
      map[row.key] = row.value;
    }
  }
  res.json(map);
});

// Admin: get all settings (aliased at both /admin/settings and /settings)
router.get("/settings", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  res.json(map);
});

router.get("/admin/settings", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  res.json(map);
});

// Admin: update a setting (aliased at both /settings/:key and /admin/settings/:key)
router.patch("/settings/:key", requireAdmin, async (req, res): Promise<void> => {
  const key = req.params["key"];
  const value = req.body?.value;
  if (typeof value !== "string" || !value.trim()) {
    res.status(400).json({ error: "Invalid value" });
    return;
  }

  await db
    .insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });

  res.json({ key, value });
});

router.patch("/admin/settings/:key", requireAdmin, async (req, res): Promise<void> => {
  const key = req.params["key"];
  const value = req.body?.value;
  if (typeof value !== "string" || !value.trim()) {
    res.status(400).json({ error: "Invalid value" });
    return;
  }

  await db
    .insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });

  res.json({ key, value });
});

export default router;
