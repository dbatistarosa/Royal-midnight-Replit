import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { settingsCache } from "./serverCache.js";

export function parseCommissionPct(raw: string | undefined): number {
  const n = parseFloat(raw ?? "70");
  return isNaN(n) ? 0.70 : n > 1 ? n / 100 : n;
}

export async function fetchCommissionPct(): Promise<number> {
  const cached = await settingsCache.getOrSet("driver_commission_pct", async () => {
    const [row] = await db
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, "driver_commission_pct"))
      .limit(1);
    return row?.value ?? "70";
  });
  return parseCommissionPct(cached);
}
