import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { Request, RequestHandler, Response, NextFunction } from "express";

/** Serialize booking mutations with card, invoice and cancellation processing. */
export type BookingActionHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
  tx: Transaction,
) => void | Promise<void>;

export function bookingAction(handler: BookingActionHandler): RequestHandler {
  return async (req, res, next) => {
    try {
      await withLock(
        "payment:" + String(req.params.id ?? req.params.bookingId),
        async (tx) => {
          // The transaction is now an explicit part of the handler contract.
          // Handlers must use it for every booking read/write in the critical
          // section; using the pool-level `db` here would escape the lock.
          await handler(req, res, next, tx);
        },
      );
    } catch (error) {
      next(error);
    }
  };
}

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Acquire a transaction-scoped advisory lock without opening a second transaction. */
export async function lockInTransaction(tx: Transaction, key: string): Promise<void> {
  await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}

/** Transaction-scoped locks work with Supabase transaction pooling as well. */
export async function withLock<T>(
  key: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await lockInTransaction(tx, key);
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
