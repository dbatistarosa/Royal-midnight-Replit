import assert from "node:assert/strict";
import { parseExpoPushResponse } from "./pushTicketParsing.ts";

const messages = [
  { to: "ExponentPushToken[working]", title: "Title", body: "Body" },
  { to: "ExponentPushToken[dead]", title: "Title", body: "Body" },
];

assert.deepEqual(
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
  {
    ticketIds: ["ticket-working"],
    invalidTokens: ["ExponentPushToken[dead]"],
    errors: ["The recipient device is not registered."],
  },
);
