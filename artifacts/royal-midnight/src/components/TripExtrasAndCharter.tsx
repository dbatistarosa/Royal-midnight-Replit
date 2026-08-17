import { Clock, Gauge, PawPrint, Baby, Wine, Flower2, Package } from "lucide-react";

/**
 * "What kind of trip is this, and what does it need?"
 *
 * Hourly charters looked identical to point-to-point rides on every screen —
 * the driver could not tell a 3-hour charter from an airport run, and neither
 * could the admin or the passenger. And add-ons were stored on every booking
 * since the day extras shipped but returned by no endpoint, so a chauffeur had
 * no way to know a car seat or a pet was expected. That is the one case where
 * not knowing means arriving unable to do the job.
 *
 * One component for all three portals so they cannot drift.
 */

export type TripExtra = {
  id: number;
  name: string;
  category: string;
  quantity: number;
  price: number;
  total: number;
  paidToDriver: boolean;
};

export type CharterInfo = {
  charterMode?: string | null;
  charterHours?: number | null;
  maxMilesPerHour?: number | null;
  hourlyRate?: number | null;
};

export function isHourly(b: CharterInfo): boolean {
  return b.charterMode === "hourly" && (b.charterHours ?? 0) > 0;
}

/** Included mileage on an hourly charter: the per-hour allowance times the
 *  booked hours. Null when either half is unknown, rather than showing "0 mi"
 *  and implying the passenger may not travel. */
export function includedMiles(b: CharterInfo): number | null {
  if (!isHourly(b)) return null;
  const perHour = b.maxMilesPerHour ?? 30; // the default frozen at trip start
  const hours = b.charterHours ?? 0;
  const total = perHour * hours;
  return total > 0 ? total : null;
}

function iconFor(category: string, name: string) {
  const n = name.toLowerCase();
  if (category === "pet" || n.includes("pet")) return PawPrint;
  if (category === "equipment" || n.includes("seat")) return Baby;
  if (n.includes("champagne") || n.includes("wine")) return Wine;
  if (n.includes("flower") || n.includes("bouquet")) return Flower2;
  return Package;
}

/**
 * The hourly-charter badge. Shown wherever a trip is listed so an hourly
 * booking is never mistaken for a transfer.
 */
export function CharterBadge({ booking, className = "" }: { booking: CharterInfo; className?: string }) {
  if (!isHourly(booking)) return null;
  const hours = booking.charterHours!;
  const miles = includedMiles(booking);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] uppercase tracking-widest border border-primary/30 bg-primary/10 text-primary ${className}`}>
      <Clock className="w-3 h-3" />
      {hours} hr{hours === 1 ? "" : "s"} hourly
      {miles != null && <span className="text-primary/60">· {miles} mi incl.</span>}
    </span>
  );
}

/**
 * Charter terms in full. `audience` decides whose money is described: a
 * chauffeur is told what they keep, everyone else is told what it costs.
 */
export function CharterDetails({
  booking,
  audience,
}: {
  booking: CharterInfo;
  audience: "driver" | "admin" | "passenger";
}) {
  if (!isHourly(booking)) return null;
  const hours = booking.charterHours!;
  const miles = includedMiles(booking);
  const rate = booking.hourlyRate ?? null;

  return (
    <div className="mt-3 pt-3 border-t border-primary/20">
      <p className="text-[10px] uppercase tracking-widest text-primary mb-2 flex items-center gap-1.5">
        <Clock className="w-3 h-3" /> Hourly Charter
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div className="flex items-start gap-2">
          <Clock className="w-3.5 h-3.5 text-primary/70 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-600">Booked Time</p>
            <p className="text-xs text-gray-300">{hours} hour{hours === 1 ? "" : "s"}</p>
          </div>
        </div>
        {miles != null && (
          <div className="flex items-start gap-2">
            <Gauge className="w-3.5 h-3.5 text-primary/70 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-600">Included Miles</p>
              <p className="text-xs text-gray-300">{miles} mi</p>
            </div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
        {audience === "driver"
          ? "The clock starts when you pick the passenger up. Finishing early changes nothing. Past 20 minutes over, another full hour is charged."
          : audience === "passenger"
            ? `The clock starts at pickup. Finishing early does not reduce the fare. If the vehicle is kept more than 20 minutes past the booked time, another full hour is charged${rate ? ` at $${rate.toFixed(2)}/hr` : ""}.`
            : `Timer starts at pickup. 20-minute allowance, then billed by the whole hour${rate ? ` at $${rate.toFixed(2)}/hr` : ""}.`}
      </p>
    </div>
  );
}

/**
 * The add-ons on a trip. For a chauffeur, the ones they keep are called out —
 * they are paid in full with no commission, and it should be obvious which.
 */
export function TripExtras({
  extras,
  audience,
}: {
  extras: TripExtra[] | null | undefined;
  audience: "driver" | "admin" | "passenger";
}) {
  if (!extras || extras.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-primary/20">
      <p className="text-[10px] uppercase tracking-widest text-primary mb-2 flex items-center gap-1.5">
        <Package className="w-3 h-3" /> Add-ons for this trip
      </p>
      <div className="space-y-1.5">
        {extras.map(e => {
          const Icon = iconFor(e.category, e.name);
          return (
            <div key={e.id} className="flex items-center gap-2">
              <Icon className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
              <span className="text-xs text-gray-300 flex-1">
                {e.name}
                {e.quantity > 1 && <span className="text-gray-500"> × {e.quantity}</span>}
              </span>
              {audience === "driver" ? (
                e.paidToDriver ? (
                  <span className="text-xs text-emerald-400">+${e.total.toFixed(2)} to you</span>
                ) : (
                  <span className="text-[11px] text-gray-600">included</span>
                )
              ) : (
                <span className="text-xs text-gray-400">${e.total.toFixed(2)}</span>
              )}
            </div>
          );
        })}
      </div>
      {audience === "driver" && extras.some(e => e.paidToDriver) && (
        <p className="text-[11px] text-emerald-400/70 mt-2">
          Add-ons marked “to you” are paid in full — no commission is taken.
        </p>
      )}
    </div>
  );
}
