import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  candidateIds: [15] as number[],
  claim: true,
  jobPayload: null as null | Record<string, unknown>,
}));

vi.mock("@workspace/db", () => ({
  bookingsTable: { id: {}, driverId: {}, pickupAt: {}, status: {} },
  db: {
    select: () => ({
      from: () => ({
        where: async () => state.candidateIds.map(id => ({ id })),
      }),
    }),
    transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
      execute: async (query: unknown) => {
        const compiled = new PgDialect().sqlToQuery(query as never);
        if (compiled.sql.includes("UPDATE bookings")) {
          return state.claim
            ? { rows: [{ id: 15, stripe_payment_intent_id: "pi_test", price_quoted: "123.45" }] }
            : { rows: [] };
        }
        if (compiled.sql.includes("INSERT INTO app_jobs")) {
          const json = compiled.params.find(value => typeof value === "string" && value.includes("refundCents"));
          state.jobPayload = JSON.parse(String(json));
        }
        return { rows: [] };
      },
    }),
  },
}));

const { expireUnassignedBookings } = await import("./expiredBookings.js");

beforeEach(() => {
  state.candidateIds = [15];
  state.claim = true;
  state.jobPayload = null;
});

it("atomically cancels an expired unassigned trip and queues a full refund", async () => {
  await expect(expireUnassignedBookings(new Date("2026-09-16T20:00:00Z"))).resolves.toBe(1);
  expect(state.jobPayload).toEqual({ intentId: "pi_test", refundCents: 12345, feeAmount: 0 });
});

it("does not queue settlement when a driver won the concurrent claim", async () => {
  state.claim = false;
  await expect(expireUnassignedBookings()).resolves.toBe(0);
  expect(state.jobPayload).toBeNull();
});
