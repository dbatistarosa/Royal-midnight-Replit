import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, sessionsTable, usersTable } from "@workspace/db";

/**
 * Session tokens: stored hashed, resolved against the live user row.
 *
 * Two problems this fixes.
 *
 * The token that authenticates was the same value sitting in sessions.token,
 * so any read-only exposure of the database — a backup, a log dump, a leaked
 * query result — handed over directly usable sessions, admin ones included, for
 * up to the full 30-day TTL. It is the same reasoning that stops passwords
 * being stored in the clear. Only the SHA-256 is persisted now; the plaintext
 * exists in the cookie and in the response to the client and nowhere else.
 *
 * SHA-256 rather than bcrypt on purpose: this value is 32 bytes from
 * crypto.randomBytes, not a human-chosen password, so there is nothing for a
 * slow hash to defend against — and it is verified on every single request.
 *
 * Separately, `role` was copied into the session row at login and trusted from
 * there. Demoting a user, or rejecting a driver, left their live sessions
 * carrying the old role for up to 30 days. The role now comes from the users
 * table on each request; the column stays for the audit trail of what the role
 * was when the session was issued.
 *
 * Both tokens are 64 hex characters, so switching to hashes needs no schema
 * change. Sessions issued before this ship simply stop resolving — everyone
 * signs in once more, which is free before launch.
 */

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export interface ResolvedSession {
  userId: number;
  /** The role as it is right now, not as it was at login. */
  role: string;
  expiresAt: Date | null;
}

/** Look up a live, unexpired session and the caller's current role. */
export async function resolveSession(token: string): Promise<ResolvedSession | null> {
  const [row] = await db
    .select({
      userId: sessionsTable.userId,
      expiresAt: sessionsTable.expiresAt,
      currentRole: usersTable.role,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(usersTable.id, sessionsTable.userId))
    .where(eq(sessionsTable.token, hashSessionToken(token)));

  if (!row) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;
  return { userId: row.userId, role: row.currentRole, expiresAt: row.expiresAt };
}

type Inserter = Pick<typeof db, "insert">;

/**
 * Issue a session and return the plaintext token to hand to the caller.
 * Accepts a transaction so registration paths can stay atomic.
 */
export async function createSession(
  userId: number,
  role: string,
  tx: Inserter = db,
): Promise<string> {
  const token = generateSessionToken();
  await tx.insert(sessionsTable).values({
    userId,
    token: hashSessionToken(token),
    role,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

/** Delete one session by its plaintext token (logout). */
export async function revokeSession(token: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.token, hashSessionToken(token)));
}

/**
 * Delete every session belonging to a user.
 *
 * Called when the account's standing changes in a way that should not survive
 * in an already-issued session: a password reset (an attacker who compromised
 * the account otherwise keeps access after the victim "recovers" it), a driver
 * rejection, or a deactivation.
 */
export async function revokeAllSessionsForUser(userId: number): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
}
