import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const state = vi.hoisted(() => ({ rewarded: false, promos: 0, mails: 0, failMail: false, completedRides: 2 }));
vi.mock("@workspace/db", () => {
  const usersTable = { id: {}, referralCode: {} }, bookingsTable = { id: {}, userId: {}, status: {} };
  const promoCodesTable = {}, settingsTable = { value: {}, key: {} };
  return { usersTable, bookingsTable, promoCodesTable, settingsTable, db: {
    execute: async () => { throw new Error("Mail escaped the business transaction"); },
    transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      const pending = { rewarded: state.rewarded, promos: state.promos, mails: state.mails };
      let usersRead = 0;
      const tx = {
        execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
          if (new PgDialect().sqlToQuery(query).sql.includes("INSERT INTO mail_outbox")) {
            if (state.failMail) throw new Error("outbox unavailable");
            pending.mails++;
          }
        },
        select: () => ({ from: (table: unknown) => ({ where: () => {
          if (table === bookingsTable) return { limit: async () => state.completedRides > 0 ? [{ id: 1 }] : [] };
          if (table === settingsTable) return Promise.resolve([{ value: "20" }]);
          return Promise.resolve(usersRead++ === 0
            ? [{ id: 2, name: "Rider", referredByUserId: 1, referralRewardedAt: pending.rewarded ? new Date() : null }]
            : [{ id: 1, name: "Referrer", email: "qa@example.invalid" }]);
        } }) }),
        insert: () => ({ values: async () => { pending.promos++; } }),
        update: () => ({ set: () => ({ where: async () => { pending.rewarded = true; } }) }),
      };
      const result = await work(tx);
      Object.assign(state, pending);
      return result;
    },
  } };
});
vi.mock("./mailer.js", () => ({ sendReferralRewardEmail: async () => {
  const { enqueueMail } = await import("./mailOutbox.js");
  await enqueueMail("qa@example.invalid", "Referral", "Test", "referral");
} }));
const { maybeRewardReferrerForCompletedRide } = await import("./referrals.js");
beforeEach(() => Object.assign(state, { rewarded: false, promos: 0, mails: 0, failMail: false, completedRides: 2 }));
describe("one-time referral award", () => {
  it("awards a delayed first reward even after a second completed ride, once only", async () => {
    await maybeRewardReferrerForCompletedRide(2);
    await maybeRewardReferrerForCompletedRide(2);
    expect([state.rewarded, state.promos, state.mails]).toEqual([true, 1, 1]);
  });
  it("rolls the promo and reward marker back if the email cannot be durably enqueued", async () => {
    state.failMail = true;
    await expect(maybeRewardReferrerForCompletedRide(2)).rejects.toThrow("outbox unavailable");
    expect([state.rewarded, state.promos, state.mails]).toEqual([false, 0, 0]);
    state.failMail = false;
    await maybeRewardReferrerForCompletedRide(2);
    expect([state.promos, state.mails]).toEqual([1, 1]);
  });
  it("does not award an account with no completed ride", async () => {
    state.completedRides = 0;
    await maybeRewardReferrerForCompletedRide(2);
    expect([state.promos, state.mails]).toEqual([0, 0]);
  });
});
