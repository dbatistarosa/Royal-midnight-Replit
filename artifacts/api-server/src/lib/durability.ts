import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { RequestHandler } from "express";

/** Serialize booking mutations with card, invoice and cancellation processing. */
export function bookingAction(handler: RequestHandler): RequestHandler {
  return async (req, res, next) => {
    try {
      await withLock(
        "payment:" + String(req.params.id ?? req.params.bookingId),
        async () => {
          await handler(req, res, next);
        },
      );
    } catch (error) {
      next(error);
    }
  };
}

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Transaction-scoped locks work with Supabase transaction pooling as well. */
export async function withLock<T>(
  key: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
    return work(tx);
  });
}

export function rows<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}

export async function setActor(tx: Transaction, userId?: number | null) {
  await tx.execute(
    sql`SELECT set_config('app.actor_user_id', ${userId ? String(userId) : ""}, true)`,
  );
}
