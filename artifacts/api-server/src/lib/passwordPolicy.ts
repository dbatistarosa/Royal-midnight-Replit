/**
 * One password policy for every account-creating path.
 *
 * The minimums were scattered and inconsistent: driver registration and
 * password reset asked for 6 characters, admin and corporate for 8, and
 * passenger registration for nothing at all — RegisterBody in the generated
 * api-zod package declares `password: zod.string()` with no length rule, so
 * "a" was a valid passenger password.
 *
 * Enforced here in the handlers rather than in the generated schema, which is
 * overwritten whenever the API contract is regenerated.
 *
 * Length over composition rules, per current NIST guidance: a 12-character
 * passphrase beats an 8-character one with a symbol bolted on, and composition
 * rules push people toward predictable substitutions. The credential rate
 * limiter covers online guessing; this covers offline cracking of a stolen
 * hash and the weakest end of what people choose.
 */

export const MIN_PASSWORD_LENGTH = 12;

/** A handful of values that pass a length check but are the first thing any
 *  wordlist tries. Not a substitute for a breach corpus — just the floor. */
const OBVIOUS_PASSWORDS = new Set([
  "password1234", "passwordpassword", "123456789012", "qwertyuiopas",
  "aaaaaaaaaaaa", "111111111111", "royalmidnight", "royalmidnight1",
]);

/** Returns a message describing why the password is unacceptable, or null when
 *  it passes. */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") return "Password is required.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  const normalized = password.toLowerCase().trim();
  if (OBVIOUS_PASSWORDS.has(normalized)) {
    return "That password is too easy to guess. Please choose another.";
  }
  // A single repeated character is long but has no entropy.
  if (new Set(normalized).size < 4) {
    return "That password is too easy to guess. Please choose another.";
  }
  return null;
}
