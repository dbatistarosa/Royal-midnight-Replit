import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import { rows } from "../lib/durability.js";
import { getMailerStatus } from "../lib/mailer.js";
import { getRedis } from "../lib/redis.js";
const router = Router();
router.get("/admin/system-health", requireAdmin, async (_req, res) => {
  const queues = rows<{ kind: string; status: string; count: number }>(
    await db.execute(sql`
 SELECT 'mail' AS kind,status,count(*)::int AS count FROM mail_outbox GROUP BY status
 UNION ALL SELECT 'jobs',status,count(*)::int FROM app_jobs GROUP BY status
 UNION ALL SELECT 'payments',status,count(*)::int FROM payment_events GROUP BY status`),
  );
  const crons = rows(
    await db.execute(
      sql`SELECT name,status,started_at,finished_at FROM cron_runs ORDER BY name`,
    ),
  );
  const project = new URL(process.env.DATABASE_URL!).username.replace(
    /^postgres\./,
    "",
  );
  res
    .set("Cache-Control", "no-store")
    .json({
      databaseProject: project,
      environment: process.env.VERCEL_ENV ?? "local",
      revision: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      mail: getMailerStatus(),
      redisConfigured: !!getRedis(),
      cronConfigured: !!(
        process.env.CRON_SECRET || process.env.CRON_WORKER_SECRET
      ),
      queues,
      crons,
    });
});
export default router;
