import { describe, expect, it } from "vitest";
import { isExpoPushToken } from "./pushToken.js";

describe("isExpoPushToken", () => {
  it("accepts both Expo token formats used by current and older clients", () => {
    expect(isExpoPushToken("ExpoPushToken[modern-token]")).toBe(true);
    expect(isExpoPushToken("ExponentPushToken[legacy-token]")).toBe(true);
  });

  it("rejects empty, malformed and unrelated device tokens", () => {
    expect(isExpoPushToken("")).toBe(false);
    expect(isExpoPushToken("ExpoPushToken[]")).toBe(false);
    expect(isExpoPushToken("fcm-device-token")).toBe(false);
  });
});
