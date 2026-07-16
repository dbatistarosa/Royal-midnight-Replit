import { Router } from "express";
import type { RequestHandler } from "express";
import { sendTripReminders, runWeeklyPayoutIfNeeded, runComplianceEnforcement, sendReviewRequests } from "../lib/cron-jobs.js";
import { logger } from "../lib/logger";

const router = Router();

function verifyCronRequest(req: import("express").Request, res: import("express").Response): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // No secret configured: fine in local dev, but in production these
    // endpoints trigger customer-facing emails — fail closed, not open.
    // (Vercel Cron automatically sends "Authorization: Bearer $CRON_SECRET"
    // once the env var exists, so prod must always have it configured.)
    if (process.env.VERCEL_ENV === "production") {
      res.status(503).json({ error: "CRON_SECRET is not configured" });
      return false;
    }
    return true;
  }

  const auth = req.headers["authorization"];
  if (auth !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// Vercel Cron invokes cron paths with a GET request (it cannot be configured to
// send POST); the GitHub Actions trip-reminders workflow calls them with POST.
// Register both verbs so the job body actually runs regardless of the caller.
// Await the job before responding: Vercel may suspend the function once the
// response is sent, so work started after res.json() is not guaranteed to run.
function registerCron(path: string, name: string, job: () => Promise<void>): void {
  const handler: RequestHandler = async (req, res) => {
    if (!verifyCronRequest(req, res)) return;
    logger.info(`Cron: ${name} triggered`);
    try {
      await job();
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, `Cron ${name} failed`);
      res.status(500).json({ error: "Cron job failed" });
    }
  };
  router.get(path, handler);
  router.post(path, handler);
}

registerCron("/cron/trip-reminders", "trip-reminders", sendTripReminders);
registerCron("/cron/weekly-payouts", "weekly-payouts", runWeeklyPayoutIfNeeded);
registerCron("/cron/compliance-check", "compliance-check", runComplianceEnforcement);
registerCron("/cron/review-requests", "review-requests", sendReviewRequests);

export default router;
