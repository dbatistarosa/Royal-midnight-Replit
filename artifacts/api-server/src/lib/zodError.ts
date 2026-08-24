import type { ZodError } from "zod";

/**
 * A message a person can act on, instead of `ZodError.message` — which is
 * the entire issue array pretty-printed as JSON (`[ { "code": "too_small",
 * "minimum": 12, ... } ]`). That was shipping verbatim as the error body on
 * every 400 from a failed `safeParse()` across auth.ts, which is exactly
 * what a driver applicant saw instead of "Password must be at least 12
 * characters." Takes the first issue, since that's what a client acts on
 * first anyway; the field path is prefixed when there is one.
 */
export function formatZodError(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return "Invalid request.";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}
