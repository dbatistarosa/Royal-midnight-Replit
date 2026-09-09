import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
const state = vi.hoisted(() => ({ exists: true, execute: vi.fn() }));
vi.mock("@workspace/db", () => ({ bookingsTable: { id: {} }, db: {
  select: () => ({ from: () => ({ where: async () => state.exists ? [{ id: 1 }] : [] }) }),
  execute: state.execute,
} }));
const { supplementalPaymentFact, recordSupplementalPayment } = await import("./supplementalPayments.js");
function event(type: string, purpose?: string, fields: Record<string, unknown> = {}) {
  return { id: "evt_test", type, data: { object: {
    id: type.startsWith("invoice.") ? "in_extra" : "pi_extra", metadata: { bookingId: "1", type: purpose },
    amount: 500, amount_received: 500, amount_paid: 500, total: 500, currency: "usd", status: "succeeded", ...fields,
  } } } as unknown as Stripe.Event;
}
beforeEach(() => { state.exists = true; vi.clearAllMocks(); });
describe("supplemental Stripe events", () => {
  it.each(["tip", "extra_time", "addon_extras"])("records a small %s payment independently of the reservation fare", async purpose => {
    const e = event("payment_intent.succeeded", purpose);
    expect(supplementalPaymentFact(e)).toMatchObject({ amount: 500, bookingId: 1, reference: "pi_extra" });
    await expect(recordSupplementalPayment(e)).resolves.toBe(true);
    expect(state.execute).toHaveBeenCalledOnce();
  });
  it("routes add-on invoice payment away from reservation invoice settlement", async () => {
    await expect(recordSupplementalPayment(event("invoice.paid", "addon_extras"))).resolves.toBe(true);
  });
  it("also isolates intent creation so it cannot become the reservation intent", async () => {
    await expect(recordSupplementalPayment(event("payment_intent.created", "tip", { amount_received: 0 }))).resolves.toBe(true);
  });
  it("leaves the primary payment and refunds on their existing paths", async () => {
    await expect(recordSupplementalPayment(event("payment_intent.succeeded"))).resolves.toBe(false);
    await expect(recordSupplementalPayment(event("charge.refunded", "addon_extras"))).resolves.toBe(false);
    expect(state.execute).not.toHaveBeenCalled();
  });
  it("does not acknowledge a failed financial ledger write", async () => {
    state.execute.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(recordSupplementalPayment(event("invoice.paid", "addon_extras"))).rejects.toThrow("database unavailable");
  });
  it("rejects a missing booking instead of silently dropping the payment", async () => {
    state.exists = false;
    await expect(recordSupplementalPayment(event("payment_intent.succeeded", "tip"))).rejects.toThrow("booking not found");
  });
  it.each([{ currency: "eur" }, { amount_received: -1 }, { amount_received: 1.5 }])("rejects malformed money %j", fields => {
    expect(() => supplementalPaymentFact(event("payment_intent.succeeded", "tip", fields))).toThrow("amount or currency");
  });
});
