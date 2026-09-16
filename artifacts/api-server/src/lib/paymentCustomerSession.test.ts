import { expect, it, vi } from "vitest";
import { createBookingCustomerSession } from "./paymentCustomerSession.js";

function stripeMock() {
  const create = vi.fn(async () => ({ client_secret: "cuss_test_secret" }));
  return { stripe: { customerSessions: { create } } as never, create };
}

it("exposes saved cards only to the account that owns the booking", async () => {
  const { stripe, create } = stripeMock();
  await expect(createBookingCustomerSession(stripe, {
    customerId: "cus_test",
    paymentAccountUserId: 7,
    callerUserId: 7,
  })).resolves.toBe("cuss_test_secret");
  expect(create).toHaveBeenCalledWith(expect.objectContaining({
    customer: "cus_test",
    components: {
      payment_element: {
        enabled: true,
        features: expect.objectContaining({
          payment_method_redisplay: "enabled",
          payment_method_allow_redisplay_filters: ["always", "limited", "unspecified"],
          payment_method_save_usage: "off_session",
        }),
      },
    },
  }));
});

it("does not expose a passenger's cards to delegates or tracking-token callers", async () => {
  const { stripe, create } = stripeMock();
  await expect(createBookingCustomerSession(stripe, {
    customerId: "cus_test",
    paymentAccountUserId: 7,
    callerUserId: 8,
  })).resolves.toBeNull();
  await expect(createBookingCustomerSession(stripe, {
    customerId: "cus_test",
    paymentAccountUserId: 7,
  })).resolves.toBeNull();
  expect(create).not.toHaveBeenCalled();
});
