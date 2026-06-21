import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db, usersTable, bookingsTable, promoCodesTable, settingsTable } from "@workspace/db";
import { logger } from "./logger.js";

export async function fetchReferralCreditAmount(): Promise<number> {
  const [row] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "referral_credit_amount"));
  const n = parseFloat(row?.value ?? "20");
  return isNaN(n) ? 20 : n;
}

function randomSuffix(bytes: number): string {
  return crypto.randomBytes(bytes).toString("hex").toUpperCase();
}

export async function ensureUniqueReferralCode(name: string): Promise<string> {
  const base = (name.split(" ")[0] ?? "RIDE").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "RIDE";

  for (let i = 0; i < 5; i++) {
    const code = `${base}${randomSuffix(2)}`;
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.referralCode, code));
    if (!existing) return code;
  }
  return `RIDE${randomSuffix(4)}`;
}

async function createOneTimePromoCode(prefix: string, amount: number, description: string): Promise<string> {
  const code = `${prefix}-${randomSuffix(3)}`;
  await db.insert(promoCodesTable).values({
    code,
    description,
    discountType: "fixed",
    discountValue: String(amount),
    maxUses: 1,
    isActive: true,
  });
  return code;
}

// Issued immediately at signup when a new user registers through someone else's referral link.
export async function issueRefereeWelcomePromo(refereeName: string): Promise<{ code: string; amount: number }> {
  const amount = await fetchReferralCreditAmount();
  const code = await createOneTimePromoCode("WELCOME", amount, `Referral welcome credit for ${refereeName}`);
  return { code, amount };
}

// Call after a booking transitions to "completed". Rewards the referrer the
// first (and only the first) time their referee finishes a ride.
export async function maybeRewardReferrerForCompletedRide(userId: number): Promise<void> {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user || !user.referredByUserId || user.referralRewardedAt) return;

    const completedRides = await db
      .select({ id: bookingsTable.id })
      .from(bookingsTable)
      .where(and(eq(bookingsTable.userId, userId), eq(bookingsTable.status, "completed")));
    if (completedRides.length !== 1) return; // only reward on the rider's first-ever completed ride

    const [referrer] = await db.select().from(usersTable).where(eq(usersTable.id, user.referredByUserId));
    if (!referrer) return;

    const amount = await fetchReferralCreditAmount();
    const code = await createOneTimePromoCode("REF", amount, `Referral reward for inviting ${user.name.split(" ")[0]}`);
    await db.update(usersTable).set({ referralRewardedAt: new Date() }).where(eq(usersTable.id, userId));

    const { sendReferralRewardEmail } = await import("./mailer.js");
    await sendReferralRewardEmail({
      referrerName: referrer.name,
      referrerEmail: referrer.email,
      refereeName: user.name,
      promoCode: code,
      amount,
    });
    logger.info({ referrerId: referrer.id, refereeId: user.id, code }, "Referral reward issued");
  } catch (err) {
    logger.error({ err, userId }, "Referral reward error (non-fatal)");
  }
}
