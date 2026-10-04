import { describe, expect, it } from "vitest";
import { serializeUser } from "./serializeUser.js";

describe("serializeUser", () => {
  it("returns only the API-safe allowlist", () => {
    const serialized = serializeUser({
      id: 7,
      name: "Passenger",
      email: "passenger@example.com",
      phone: null,
      emailVerifiedAt: null,
      role: "passenger",
      passwordHash: "bcrypt-hash-must-not-leak",
      stripeCustomerId: "cus_sensitive",
      defaultPaymentMethodId: "pm_sensitive",
      cabinTempF: 70,
      musicPreference: "Jazz",
      quietRide: false,
      preferredBeverage: "Water",
      opensOwnDoor: true,
      addressTitle: null,
      vipNotes: "Private admin note",
      referralCode: "REF-123",
      referredByUserId: null,
      referralRewardedAt: null,
      corporateAccountId: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(serialized).toEqual({
      id: 7,
      name: "Passenger",
      email: "passenger@example.com",
      phone: null,
      role: "passenger",
      createdAt: "2026-01-01T00:00:00.000Z",
      cabinTempF: 70,
      musicPreference: "Jazz",
      quietRide: false,
      preferredBeverage: "Water",
      opensOwnDoor: true,
      addressTitle: null,
    });

    expect(serialized).not.toHaveProperty("passwordHash");
    expect(serialized).not.toHaveProperty("stripeCustomerId");
    expect(serialized).not.toHaveProperty("defaultPaymentMethodId");
    expect(serialized).not.toHaveProperty("vipNotes");
    expect(serialized).not.toHaveProperty("referralCode");
  });
});
