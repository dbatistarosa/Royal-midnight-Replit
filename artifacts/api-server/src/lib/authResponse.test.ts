import { describe, expect, it } from "vitest";
import { DRIVER_APP_CLIENT, withNativeToken } from "./authResponse.js";

describe("authentication response tokens", () => {
  const response = { user: { id: 1 } };

  it("does not expose a bearer token to browser clients", () => {
    expect(withNativeToken(response, "secret", undefined)).toEqual(response);
    expect(withNativeToken(response, "secret", "web")).toEqual(response);
  });

  it("returns a token only to the explicit driver app client", () => {
    expect(withNativeToken(response, "secret", DRIVER_APP_CLIENT)).toEqual({
      ...response,
      token: "secret",
    });
  });
});
