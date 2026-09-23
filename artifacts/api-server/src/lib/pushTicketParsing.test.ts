import { describe, expect, it } from "vitest";
import { parseExpoPushResponse } from "./pushTicketParsing";

describe("parseExpoPushResponse", () => {
  it("keeps successful ticket ids and identifies unregistered devices", () => {
    const messages = [
      { to: "ExponentPushToken[working]", title: "Title", body: "Body" },
      { to: "ExponentPushToken[dead]", title: "Title", body: "Body" },
    ];

    expect(
      parseExpoPushResponse(messages, {
        data: [
          { status: "ok", id: "ticket-working" },
          {
            status: "error",
            message: "The recipient device is not registered.",
            details: { error: "DeviceNotRegistered" },
          },
        ],
      }),
    ).toEqual({
      ticketIds: ["ticket-working"],
      invalidTokens: ["ExponentPushToken[dead]"],
      errors: ["The recipient device is not registered."],
    });
  });
});
