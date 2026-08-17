import { useState, useEffect } from "react";
import { Clock, AlertTriangle } from "lucide-react";

/**
 * The live clock on an hourly charter in progress.
 *
 * There was no timer at all: trip_started_at was recorded and then nothing read
 * it until the trip was completed, so a chauffeur running an hourly charter had
 * no idea how much of the booked block was left, and no warning before it
 * started costing the passenger another hour.
 *
 * Counts up from the actual pickup, because that is what the passenger is
 * billed from — a driver waiting at the kerb does not burn the block.
 *
 * The numbers here must agree with lib/hourlyOverage.ts on the server, which is
 * the authority: 20 minutes' allowance, then billed by the whole hour.
 */

const GRACE_MINUTES = 20;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function CharterTimer({
  startedAt,
  charterHours,
  hourlyRate,
  audience = "driver",
}: {
  startedAt: string | null | undefined;
  charterHours: number | string | null | undefined;
  hourlyRate?: number | string | null;
  audience?: "driver" | "admin";
}) {
  // Same defensive coercion as the charter panels: a `numeric` column can reach
  // the browser as a string, and arithmetic on one silently yields NaN while
  // .toFixed() throws outright.
  const num = (v: number | string | null | undefined): number | null => {
    if (v == null || v === "") return null;
    const parsed = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Once a second: the display shows seconds, and a minute-resolution tick
    // would make it visibly stutter.
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const hours = num(charterHours);
  const rate = num(hourlyRate) ?? 0;
  if (!startedAt || !hours || hours <= 0) return null;

  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return null;

  const elapsedMs = Math.max(0, now - started);
  const elapsedMin = Math.floor(elapsedMs / 60_000);
  const contractedMin = hours * 60;
  const remainingMin = contractedMin - elapsedMin;
  const overtimeMin = Math.max(0, -remainingMin);

  const h = Math.floor(elapsedMs / 3_600_000);
  const m = Math.floor((elapsedMs % 3_600_000) / 60_000);
  const s = Math.floor((elapsedMs % 60_000) / 1000);

  // Mirrors computeHourlyOverage: the whole overrun rounds up to the next hour
  // once the allowance is passed.
  const billedHours = overtimeMin > GRACE_MINUTES ? Math.ceil(overtimeMin / 60) : 0;
  const projectedCharge = billedHours * rate;

  const state: "running" | "grace" | "billing" =
    overtimeMin === 0 ? "running" : overtimeMin <= GRACE_MINUTES ? "grace" : "billing";

  const tone =
    state === "billing"
      ? { border: "border-red-500/40", bg: "bg-red-500/10", text: "text-red-300", label: "text-red-400" }
      : state === "grace"
        ? { border: "border-amber-400/40", bg: "bg-amber-400/10", text: "text-amber-200", label: "text-amber-400" }
        : { border: "border-primary/30", bg: "bg-primary/5", text: "text-primary", label: "text-primary/70" };

  return (
    <div className={`mt-3 border ${tone.border} ${tone.bg} px-4 py-3`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={`text-[10px] uppercase tracking-widest ${tone.label} flex items-center gap-1.5 mb-1`}>
            <Clock className="w-3 h-3" /> Charter running
          </p>
          <p className={`font-mono text-2xl ${tone.text} tabular-nums`}>
            {pad(h)}:{pad(m)}:{pad(s)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">
            {state === "running" ? "Time left" : "Over by"}
          </p>
          <p className={`text-sm ${tone.text}`}>
            {state === "running"
              ? `${Math.floor(remainingMin / 60)}h ${remainingMin % 60}m`
              : `${overtimeMin} min`}
          </p>
        </div>
      </div>

      {state === "grace" && (
        <p className="text-[11px] text-amber-300/90 mt-2 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
          {GRACE_MINUTES - overtimeMin} minute{GRACE_MINUTES - overtimeMin === 1 ? "" : "s"} of the allowance left.
          {audience === "driver"
            ? " Past that, the passenger is charged another full hour."
            : " Past that, another full hour is billed."}
        </p>
      )}

      {state === "billing" && (
        <p className="text-[11px] text-red-300/90 mt-2 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
          Past the {GRACE_MINUTES}-minute allowance — {billedHours} extra hour{billedHours === 1 ? "" : "s"}
          {projectedCharge > 0 ? ` ($${projectedCharge.toFixed(2)})` : ""} will be added on completion.
        </p>
      )}

      {state === "running" && (
        <p className="text-[11px] text-gray-500 mt-2">
          Started at {new Date(started).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
          Finishing early does not reduce the fare.
        </p>
      )}
    </div>
  );
}
