import type { Request, Response, NextFunction } from "express";
import { resolveSession } from "../lib/session.js";

export interface AuthUser {
  userId: number;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      currentUser?: AuthUser;
    }
  }
}

/** Name of the HttpOnly session cookie used by the web app. */
export const SESSION_COOKIE = "rm_session";

/** Read the session token from the HttpOnly cookie, falling back to the
 *  Authorization header.
 *
 *  The browser app now keeps its session in a cookie that page JavaScript
 *  cannot read, so an XSS can no longer exfiltrate an admin session (CN-014).
 *  The React Native driver app has no cookie jar and stores its token in
 *  expo-secure-store — already the right place — so it keeps sending a bearer
 *  header, and both paths are accepted here. */
function readSessionToken(req: Request): string | null {
  const cookies = req.cookies as Record<string, string> | undefined;
  const fromCookie = cookies?.[SESSION_COOKIE];
  if (fromCookie && fromCookie.trim()) return fromCookie.trim();

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  return null;
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readSessionToken(req);
  if (!token) {
    req.log?.warn({ ip: req.ip, path: req.path }, "authentication_required");
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const session = await resolveSession(token);
  if (!session) {
    req.log?.warn({ ip: req.ip, path: req.path }, "invalid_or_expired_session");
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  if (session.role !== "admin") {
    const extra = { ip: req.ip, path: req.path, userId: session.userId, role: session.role };
    req.log?.warn(extra, "authorization_failed");
    // Dynamic import — see lib/sentry.ts's comment on why this must never be static.
    void import("../lib/sentry.js")
      .then(({ captureSecurityEvent }) => captureSecurityEvent("authorization_failed", extra))
      .catch(() => {});
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  req.currentUser = { userId: session.userId, role: session.role };
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readSessionToken(req);
  if (!token) {
    req.log?.warn({ ip: req.ip, path: req.path }, "authentication_required");
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const session = await resolveSession(token);
  if (!session) {
    req.log?.warn({ ip: req.ip, path: req.path }, "invalid_or_expired_session");
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  req.currentUser = { userId: session.userId, role: session.role };
  next();
}

// Optional auth — sets currentUser if a valid session is present, but does not block unauthenticated requests
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = readSessionToken(req);
  if (token) {
    const session = await resolveSession(token);
    if (session) {
      req.currentUser = { userId: session.userId, role: session.role };
    }
  }
  next();
}
