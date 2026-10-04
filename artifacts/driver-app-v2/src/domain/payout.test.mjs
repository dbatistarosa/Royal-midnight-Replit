import test from "node:test";
import assert from "node:assert/strict";
import { digitsOnly, validatePayoutSecrets } from "./payout.ts";

test("payout secret fields are normalized without exposing stored values", () => {
  assert.equal(digitsOnly("123-45-6789", 9), "123456789");
  assert.equal(validatePayoutSecrets({ ssn: "123-45-6789", routingNumber: "021000021", accountNumber: "1234" }), null);
  assert.equal(validatePayoutSecrets({ ssn: "123" }), "A Tax ID / SSN must contain 9 digits.");
});
