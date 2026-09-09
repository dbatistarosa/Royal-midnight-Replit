import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  status: "in_progress", rides: 0, jobs: 0, failQueue: false,
  email: vi.fn(), reward: vi.fn(),
}));
vi.mock("@workspace/db", () => {
  const bookingsTable = { id: {}, driverId: {}, status: {} };
  const driversTable = { id: {}, totalRides: {} };
  return { bookingsTable, driversTable, db: {
    transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      const pending = { status: state.status, rides: state.rides, jobs: state.jobs };
      const tx = {
        update: (table: unknown) => ({ set: () => ({ where: () => table === bookingsTable
          ? { returning: async () => {
            if (pending.status !== "in_progress") return [];
            pending.status = "completed";
            return [{ id: 1, status: "completed" }];
          } }
          : Promise.resolve().then(() => { pending.rides++; }) }) }),
        execute: async () => {
          if (state.failQueue) throw new Error("queue unavailable");
          pending.jobs++;
        },
      };
      const result = await work(tx);
      Object.assign(state, pending);
      return result;
    },
    select: () => ({ from: () => ({ where: async () => [{
      id: 1, status: state.status, userId: 2, passengerName: "QA", passengerEmail: "qa@example.invalid",
      pickupAddress: "MIA", dropoffAddress: "Miami", pickupAt: new Date(), vehicleClass: "business",
      passengers: 1, priceQuoted: "100", tipAmount: null, extraCharge: "0",
    }] }) }),
  } };
});
vi.mock("./mailer.js", () => ({ sendTripCompletionEmail: state.email }));
vi.mock("./referrals.js", () => ({ maybeRewardReferrerForCompletedRide: state.reward }));
const { commitTripCompletion, notifyTripCompletion } = await import("./tripCompletion.js");
const input = { bookingId: 1, driverId: 3, endedAt: new Date(), extraCharge: 0, totalPrice: 100 };
beforeEach(() => {
  Object.assign(state, { status: "in_progress", rides: 0, jobs: 0, failQueue: false });
  vi.resetAllMocks();
});
describe("trip completion durability", () => {
  it("rolls back completion and ride count when its durable job cannot be saved", async () => {
    state.failQueue = true;
    await expect(commitTripCompletion(input)).rejects.toThrow("queue unavailable");
    expect([state.status, state.rides, state.jobs]).toEqual(["in_progress", 0, 0]);
    state.failQueue = false;
    await commitTripCompletion(input);
    expect([state.status, state.rides, state.jobs]).toEqual(["completed", 1, 1]);
  });
  it("does not repeat the counter or job after a committed response is lost", async () => {
    await commitTripCompletion(input);
    await expect(commitTripCompletion(input)).resolves.toBeUndefined();
    expect([state.rides, state.jobs]).toEqual([1, 1]);
  });
  it("leaves email failures retryable without issuing the referral early", async () => {
    state.status = "completed";
    state.email.mockRejectedValueOnce(new Error("outbox unavailable"));
    await expect(notifyTripCompletion(1)).rejects.toThrow("outbox unavailable");
    expect(state.reward).not.toHaveBeenCalled();
    await notifyTripCompletion(1);
    expect(state.reward).toHaveBeenCalledWith(2);
  });
  it("does not send a completed-trip receipt for an active trip", async () => {
    await notifyTripCompletion(1);
    expect(state.email).not.toHaveBeenCalled();
  });
});
