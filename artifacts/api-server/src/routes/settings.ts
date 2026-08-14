import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import { isSecretSetting, redactSettings } from "../lib/secretSettings.js";

const router: IRouter = Router();

// Public read of safe settings (min_booking_hours, florida_tax_rate)
router.get("/settings/public", async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = {};
  for (const row of rows) {
    // Only expose non-sensitive keys
    if (["min_booking_hours", "florida_tax_rate", "cc_fee_pct", "social_instagram_url", "social_facebook_url", "social_google_profile_url"].includes(row.key)) {
      map[row.key] = row.value;
    }
  }
  res.json(map);
});

// Admin: get all settings (aliased at both /admin/settings and /settings).
// Credential-bearing rows are redacted — an admin session compromise or an XSS
// in the panel would otherwise hand over the Stripe webhook signing secret,
// which is enough to forge payment_intent.succeeded events.
router.get("/settings", requireAdmin, async (_req, res): Promise<void> => {
  res.json(redactSettings(await db.select().from(settingsTable)));
});

router.get("/admin/settings", requireAdmin, async (_req, res): Promise<void> => {
  res.json(redactSettings(await db.select().from(settingsTable)));
});

// Admin: bulk-update settings object PATCH /settings (and /admin/settings alias)
async function bulkPatchSettings(body: unknown, res: import("express").Response): Promise<void> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    res.status(400).json({ error: "Body must be a key-value settings object" });
    return;
  }
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length === 0) {
    res.status(400).json({ error: "No settings provided" });
    return;
  }
  // A bulk PATCH that carries a redacted placeholder back would otherwise
  // overwrite the real secret with "••••••••" — and an attacker with an admin
  // session could set it to a value they choose and forge webhook events.
  const rejected = entries.filter(([key]) => isSecretSetting(key)).map(([key]) => key);
  if (rejected.length > 0) {
    res.status(403).json({
      error: `These settings can only be changed via environment variables: ${rejected.join(", ")}`,
    });
    return;
  }

  const result: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value !== "string") continue;
    await db
      .insert(settingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
    result[key] = value;
  }
  res.json(result);
}

router.patch("/settings", requireAdmin, async (req, res): Promise<void> => {
  await bulkPatchSettings(req.body, res);
});

router.patch("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  await bulkPatchSettings(req.body, res);
});

// Admin: update a single setting (aliased at both /settings/:key and /admin/settings/:key)
router.patch("/settings/:key", requireAdmin, async (req, res): Promise<void> => {
  const key = String(req.params["key"] ?? "");
  const value = req.body?.value;
  if (typeof value !== "string" || !value.trim()) {
    res.status(400).json({ error: "Invalid value" });
    return;
  }
  if (isSecretSetting(key)) {
    res.status(403).json({ error: "This setting can only be changed via environment variables." });
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
  const key = String(req.params["key"] ?? "");
  const value = req.body?.value;
  if (typeof value !== "string" || !value.trim()) {
    res.status(400).json({ error: "Invalid value" });
    return;
  }
  if (isSecretSetting(key)) {
    res.status(403).json({ error: "This setting can only be changed via environment variables." });
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
