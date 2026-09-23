import assert from "node:assert/strict";

import { normalizeLoginCredentials, validateLoginCredentials } from "./loginValidation.ts";

const valid = { email: " Driver@RoyalMidnight.com ", password: "correct horse battery staple" };

assert.deepEqual(normalizeLoginCredentials(valid), {
  email: "driver@royalmidnight.com",
  password: valid.password,
});
assert.deepEqual(validateLoginCredentials(valid), { ok: true });
assert.deepEqual(validateLoginCredentials({ email: "", password: "" }), {
  ok: false,
  message: "Ingresa tu correo y contraseña.",
});
assert.deepEqual(validateLoginCredentials({ email: "not-an-email", password: "password" }), {
  ok: false,
  message: "Ingresa un correo electrónico válido.",
});
assert.deepEqual(validateLoginCredentials({ email: "driver@example.com", password: "" }), {
  ok: false,
  message: "Ingresa tu contraseña.",
});
