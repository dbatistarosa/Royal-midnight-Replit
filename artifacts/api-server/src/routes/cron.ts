import { Router } from "express";
import { sendTripReminders, runWeeklyPayoutIfNeeded, runComplianceEnforcement, sendReviewRequests } from "../lib/cron-jobs.js";
import { logger } from "../lib/logger";

const router = Router();

function verifyCronRequest(req: import("express").Request, res: import("express").Response): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // secret not configured — allow (dev / Vercel managed)

  const auth = req.headers["authorization"];
  if (auth !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

router.post("/cron/trip-reminders", async (req, res) => {
  if (!verifyCronRequest(req, res)) return;
  logger.info("Cron: trip-reminders triggered");
  res.json({ ok: true });
  await sendTripReminders();
});

router.post("/cron/weekly-payouts", async (req, res) => {
  if (!verifyCronRequest(req, res)) return;
  logger.info("Cron: weekly-payouts triggered");
  res.json({ ok: true });
  await runWeeklyPayoutIfNeeded();
});

router.post("/cron/compliance-check", async (req, res) => {
  if (!verifyCronRequest(req, res)) return;
  logger.info("Cron: compliance-check triggered");
  res.json({ ok: true });
  await runComplianceEnforcement();
});

router.post("/cron/review-requests", async (req, res) => {
  if (!verifyCronRequest(req, res)) return;
  logger.info("Cron: review-requests triggered");
  res.json({ ok: true });
  await sendReviewRequests();
});

export default router;
