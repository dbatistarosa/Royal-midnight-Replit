import { describe, expect, it } from "vitest";
import { promoPerCustomerLimitMessage } from "./promoPolicy.js";

describe("promoPerCustomerLimitMessage", () => {
  it("requires identity for a per-customer promotion", () => {
    expect(promoPerCustomerLimitMessage({ maxUsesPerUser: 1, userId: null, usedByUser: 0 }))
      .toMatch(/Sign in/i);
  });

  it("rejects a second WELCOME20-style redemption", () => {
    expect(promoPerCustomerLimitMessage({ maxUsesPerUser: 1, userId: 27, usedByUser: 1 }))
      .toBe("You have already used this promo code.");
  });

  it("allows the first authenticated redemption and unlimited promotions", () => {
    expect(promoPerCustomerLimitMessage({ maxUsesPerUser: 1, userId: 27, usedByUser: 0 })).toBeNull();
    expect(promoPerCustomerLimitMessage({ maxUsesPerUser: null, userId: null, usedByUser: 99 })).toBeNull();
  });
});
