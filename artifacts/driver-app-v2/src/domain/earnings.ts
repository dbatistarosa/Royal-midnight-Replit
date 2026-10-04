export type EarningsRangeKey = "today" | "week" | "month" | "all" | "custom";

/** Parse a date-only input without allowing JavaScript to normalize invalid days. */
export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function buildCustomEarningsRange(startValue: string, endValue: string): { startDate: string; endDate: string } | null {
  const start = parseDateOnly(startValue);
  const end = parseDateOnly(endValue);
  if (!start || !end || start > end) return null;
  end.setHours(23, 59, 59, 999);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

export function earningsPeriodLabel(key: EarningsRangeKey, start?: string, end?: string): string {
  if (key === "custom" && start && end) return `${start} – ${end}`;
  if (key === "all") return "All Time";
  if (key === "today") return "Today";
  if (key === "week") return "This Week";
  return "This Month";
}

export function periodFareShare(periodEarnings: number, periodTips: number): number {
  return Math.max(0, periodEarnings - periodTips);
}

export function averagePerRide(periodEarnings: number, periodRides: number): number {
  return periodRides > 0 ? periodEarnings / periodRides : 0;
}

export function statementText(input: {
  periodLabel: string;
  periodEarnings: number;
  periodTips: number;
  periodRides: number;
  commissionPct: number;
}): string {
  const fare = periodFareShare(input.periodEarnings, input.periodTips);
  return [
    `Royal Midnight Driver Earnings — ${input.periodLabel}`,
    `Total: $${input.periodEarnings.toFixed(2)}`,
    `Fare share: $${fare.toFixed(2)} (${(input.commissionPct * 100).toFixed(0)}%)`,
    `Tips: $${input.periodTips.toFixed(2)}`,
    `Completed rides: ${input.periodRides}`,
    `Average per ride: $${averagePerRide(input.periodEarnings, input.periodRides).toFixed(2)}`,
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function statementHtml(input: {
  periodLabel: string;
  periodEarnings: number;
  periodTips: number;
  periodRides: number;
  commissionPct: number;
}): string {
  const fare = periodFareShare(input.periodEarnings, input.periodTips);
  const row = (label: string, value: string) => `<div class="row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;color:#111827;padding:32px}
    h1{font-size:24px;margin:0 0 6px;color:#111827}
    .period{color:#6b7280;margin-bottom:28px}
    .row{display:flex;justify-content:space-between;border-bottom:1px solid #e5e7eb;padding:12px 0;font-size:15px}
    .total{font-size:20px;color:#b78b2a}
  </style></head><body>
    <h1>Royal Midnight Driver Earnings</h1>
    <div class="period">${escapeHtml(input.periodLabel)}</div>
    ${row("Total earnings", `$${input.periodEarnings.toFixed(2)}`)}
    ${row("Fare share", `$${fare.toFixed(2)} (${(input.commissionPct * 100).toFixed(0)}%)`)}
    ${row("Tips", `$${input.periodTips.toFixed(2)}`)}
    ${row("Completed rides", String(input.periodRides))}
    ${row("Average per ride", `$${averagePerRide(input.periodEarnings, input.periodRides).toFixed(2)}`)}
  </body></html>`;
}
