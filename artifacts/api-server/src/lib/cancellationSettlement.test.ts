import { describe, it, expect, vi, beforeEach } from "vitest";
const state = vi.hoisted(() => ({
  booking: {
    id: 1,
    status: "cancelled",
    stripePaymentIntentId: "pi_test",
    priceQuoted: "100",
  },
  payload: { intentId: "pi_test", refundCents: 7500, feeAmount: 25 },
  retrieve: vi.fn(),
  cancel: vi.fn(),
  refund: vi.fn(),
  email: vi.fn(),
}));
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [state.booking] }) }),
    execute: async () => ({ rows: [{ payload: state.payload }] }),
  },
  bookingsTable: { id: {} },
}));
vi.mock("./serializeBooking.js", () => ({
  serializeBooking: (b: unknown) => b,
}));
vi.mock("./mailer.js", () => ({
  sendBookingCancelledAdmin: state.email,
  sendBookingCancelledPassenger: state.email,
}));
vi.mock("stripe", () => ({
  default: class {
    paymentIntents = { retrieve: state.retrieve, cancel: state.cancel };
    refunds = { create: state.refund };
  },
}));
const { settleBookingCancellation } = await import("./cancellationSettlement");
beforeEach(() => {
  vi.clearAllMocks();
  state.booking.status = "cancelled";
  state.retrieve.mockResolvedValue({
    status: "succeeded",
    amount_received: 10000,
    latest_charge: { amount_refunded: 0 },
  });
  state.refund.mockResolvedValue({ id: "re_test" });
});
describe("durable cancellation settlement", () => {
  it("refunds the recorded policy amount, preserving the cancellation fee", async () => {
    await settleBookingCancellation(1);
    expect(state.refund).toHaveBeenCalledWith(
      { payment_intent: "pi_test", amount: 7500 },
      { idempotencyKey: "booking-cancellation-refund-pi_test-7500" },
    );
  });
  it("does not refund again after a successful refund and a lost response", async () => {
    state.retrieve.mockResolvedValue({
      status: "succeeded",
      amount_received: 10000,
      latest_charge: { amount_refunded: 7500 },
    });
    await settleBookingCancellation(1);
    expect(state.refund).not.toHaveBeenCalled();
  });
  it("releases an uncaptured hold without creating a refund", async () => {
    state.retrieve.mockResolvedValue({ status: "requires_capture" });
    await settleBookingCancellation(1);
    expect(state.cancel).toHaveBeenCalledOnce();
    expect(state.refund).not.toHaveBeenCalled();
  });
  it("keeps processing payments retryable without promising a completed refund", async () => {
    state.retrieve.mockResolvedValue({ status: "processing" });
    await expect(settleBookingCancellation(1)).rejects.toThrow("processing");
    expect(state.email).not.toHaveBeenCalled();
  });
  it("propagates provider failures so the durable job is retried", async () => {
    state.refund.mockRejectedValue(new Error("Stripe unavailable"));
    await expect(settleBookingCancellation(1)).rejects.toThrow(
      "Stripe unavailable",
    );
    expect(state.email).not.toHaveBeenCalled();
  });
  it("does not settle a booking that is still active", async () => {
    state.booking.status = "confirmed";
    await settleBookingCancellation(1);
    expect(state.retrieve).not.toHaveBeenCalled();
  });
});
