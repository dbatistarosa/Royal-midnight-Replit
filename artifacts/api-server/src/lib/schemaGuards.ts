import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/**
 * "Does this table exist yet?", cached per process.
 *
 * Deploys and migrations are separate steps in this project, and code has
 * shipped ahead of its schema more than once. Where that only degrades a
 * feature the route can catch the Postgres error, but a missing table inside a
 * query that a live screen depends on takes the screen down instead — the
 * driver trip pool is the case that matters here.
 *
 * to_regclass returns NULL rather than raising for an unknown relation, so this
 * can be asked safely. The answer is cached because a table appearing is a
 * deploy-time event, not a per-request one; a process started before the
 * migration keeps the old answer until it recycles, which is the correct
 * trade-off against querying the catalog on every request.
 */
const cache = new Map<string, boolean>();

export async function tableExists(qualifiedName: string): Promise<boolean> {
  const cached = cache.get(qualifiedName);
  if (cached !== undefined) return cached;

  try {
    const result = await db.execute(sql`SELECT to_regclass(${qualifiedName}) IS NOT NULL AS present`);
    const rows = (result as unknown as { rows?: Array<{ present: boolean }> }).rows
      ?? (result as unknown as Array<{ present: boolean }>);
    const present = Boolean(rows?.[0]?.present);
    // Only a positive answer is cached. A negative one may just mean the
    // migration has not run yet, and re-checking costs one cheap catalog
    // lookup — far better than staying degraded until the next deploy.
    if (present) cache.set(qualifiedName, true);
    return present;
  } catch {
    return false;
  }
}

/** Set by migration 0008. Until it runs there can be no blocks recorded, so
 *  treating "table absent" as "no blocks" is exact, not a relaxation. */
export function hasDriverBlockTable(): Promise<boolean> {
  return tableExists("public.booking_driver_blocks");
}
