import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, sessionsTable, usersTable } from "@workspace/db";

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

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.slice(7).trim();
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.token, token));

  if (!session) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  if (session.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  req.currentUser = { userId: session.userId, role: session.role };
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.slice(7).trim();
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.token, token));

  if (!session) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  req.currentUser = { userId: session.userId, role: session.role };
  next();
}
