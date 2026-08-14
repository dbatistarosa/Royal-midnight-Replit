/**
 * Settings rows that are credentials, not configuration.
 *
 * The `settings` table is a generic key/value store the admin panel reads whole
 * (`SELECT *`), so anything written into it is handed to the admin's browser on
 * every settings page load. `stripe_webhook_secret` lands there automatically
 * when the webhook is auto-registered — and that value is what authenticates
 * Stripe's callbacks. Whoever holds it can forge `payment_intent.succeeded`
 * and mark bookings as paid without paying.
 *
 * These keys are therefore redacted on read and refused on write through the
 * settings API. They are set by the server (webhook auto-registration) or out
 * of band, never from the UI.
 */
export const SECRET_SETTING_KEYS: ReadonlySet<string> = new Set([
  "stripe_webhook_secret",
  "edge_function_invoke_secret",
]);

export const REDACTED = "••••••••";

export function isSecretSetting(key: string): boolean {
  return SECRET_SETTING_KEYS.has(key);
}

/** Turn setting rows into the map the admin UI expects, with credentials
 *  replaced by a placeholder that still reads as "this is configured". */
export function redactSettings(rows: Array<{ key: string; value: string }>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = isSecretSetting(row.key) ? REDACTED : row.value;
  }
  return map;
}
