/**
 * Postgres error codes survive drizzle, but not at the top level.
 *
 * drizzle-orm wraps driver errors, so `err.code` on the thrown value is
 * undefined and a naive `err.code === "42703"` check silently never matches.
 * That cost a full deploy once already. Walk the cause chain instead.
 */
export function hasPgErrorCode(err: unknown, code: string): boolean {
  let cur: unknown = err;
  for (let depth = 0; cur && depth < 5; depth++) {
    if ((cur as { code?: string }).code === code) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/** 42703 — column referenced by the query does not exist. */
export const UNDEFINED_COLUMN = "42703";
/** 42P01 — table referenced by the query does not exist. */
export const UNDEFINED_TABLE = "42P01";
