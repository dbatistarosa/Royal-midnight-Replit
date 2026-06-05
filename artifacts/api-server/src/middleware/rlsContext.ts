import type { Request, Response, NextFunction } from "express";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { pool, createDrizzle } from "@workspace/db";
import * as schema from "@workspace/db/schema";

// Per-request Drizzle instance scoped to the authenticated user's RLS context.
// Queries via req.db are subject to FORCE ROW LEVEL SECURITY policies that
// compare app.current_user_id / app.current_user_role to the requesting user.
declare global {
  namespace Express {
    interface Request {
      db?: NodePgDatabase<typeof schema>;
    }
  }
}

export async function bindRLSContext(
  userId: number,
  role: string,
  req: Request,
  res: Response,
): Promise<void> {
  const client = await pool.connect();

  await client.query(
    "SELECT set_config('app.current_user_id', $1, FALSE), set_config('app.current_user_role', $2, FALSE)",
    [userId.toString(), role],
  );

  req.db = createDrizzle(client, { schema });

  res.on("finish", () => {
    // Reset to empty so the connection returns to pool with no user context
    // (helper functions treat '' as service/unrestricted)
    client
      .query(
        "SELECT set_config('app.current_user_id', '', FALSE), set_config('app.current_user_role', '', FALSE)",
      )
      .then(() => client.release())
      .catch(() => client.release(true));
  });
}
