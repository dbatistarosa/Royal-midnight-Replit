import type { Request, Response, NextFunction } from "express";

// Fields that describe the platform's internal economics. Admin and driver
// screens use them; passengers and corporate accounts have no reason to see
// what cut the chauffeur/platform takes on their ride (OWASP API3:2023).
const INTERNAL_FIELDS = new Set(["commissionPct"]);
const RESTRICTED_ROLES = new Set(["passenger", "corporate"]);

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (!INTERNAL_FIELDS.has(k)) out[k] = strip(v);
    }
    return out;
  }
  return value;
}

/**
 * Wraps res.json so every response to a passenger/corporate caller has
 * internal-only fields removed, whichever route built it. The role is read
 * when the response is sent, after route-level auth has set currentUser.
 */
export function stripInternalFields(req: Request, res: Response, next: NextFunction): void {
  const json = res.json.bind(res);
  res.json = (body?: unknown) => {
    const role = req.currentUser?.role;
    return json(role && RESTRICTED_ROLES.has(role) ? strip(body) : body);
  };
  next();
}
