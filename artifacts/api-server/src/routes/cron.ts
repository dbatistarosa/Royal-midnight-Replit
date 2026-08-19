import { Router } from "express";
import type { RequestHandler } from "express";
import crypto from "crypto";
import { sendTripReminders, runWeeklyPayoutIfNeeded, runComplianceEnforcement, sendReviewRequests } from "../lib/cron-jobs.js";
import { logger } from "../lib/logger";

const router = Router();

function verifyCronRequest(req: import("express").Request, res: import("express").Response): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    // Fail closed. This used to key on VERCEL_ENV === "production", but that
    // variable only exists on Vercel — so on Railway, on preview deploys and on
    // any self-hosted run the guard returned true and every cron endpoint was
    // public. An unauthenticated GET /api/cron/weekly-payouts emails every
    // approved driver, including decrypted bank details (CN-006).
    //
    // Local development opts out explicitly instead of being inferred.
    if (process.env.ALLOW_INSECURE_CRON === "1") {
      logger.warn("CRON_SECRET unset and ALLOW_INSECURE_CRON=1 — cron endpoints are UNAUTHENTICATED");
      return true;
    }
    logger.error("CRON_SECRET is not configured — refusing to run cron job");
    res.status(503).json({ error: "CRON_SECRET is not configured" });
    return false;
  }

  const rawAuth = req.headers["authorization"];
  const auth = Array.isArray(rawAuth) ? rawAuth[0] ?? "" : rawAuth ?? "";

  // Constant-time compare so the secret cannot be recovered byte by byte.
  const provided = Buffer.from(auth);
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const matches =
    provided.length === expected.length && crypto.timingSafeEqual(provided, expected);

  if (!matches) {
    const extra = { ip: req.ip, path: req.path };
    logger.warn(extra, "cron_auth_failed");
    // Dynamic import — see lib/sentry.ts's comment on why this must never be static.
    void import("../lib/sentry.js")
      .then(({ captureSecurityEvent }) => captureSecurityEvent("cron_auth_failed", extra))
      .catch(() => {});
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
