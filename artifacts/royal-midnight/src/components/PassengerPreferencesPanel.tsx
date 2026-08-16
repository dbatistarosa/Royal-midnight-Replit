import { Tag, Thermometer, Music, Volume2, Coffee, DoorOpen } from "lucide-react";

/**
 * The passenger preference block exactly as a chauffeur sees it on their trip
 * manifest.
 *
 * Extracted from the driver dashboard so the admin passenger screen can show a
 * true preview rather than a second rendering that drifts from it. The whole
 * point of "see what the driver sees" is that it is the same component — if
 * this block changes, both screens change together.
 */

export type PassengerPreferences = {
  cabinTempF?: number | null;
  musicPreference?: string | null;
  quietRide?: boolean | null;
  preferredBeverage?: string | null;
  opensOwnDoor?: boolean | null;
  addressTitle?: string | null;
  vipNotes?: string | null;
};

/** Is there anything worth showing? A passenger who has set nothing renders
 *  no panel at all on the driver's manifest, and the preview must agree. */
export function hasAnyPreference(p: PassengerPreferences | null | undefined): boolean {
  if (!p) return false;
  return (
    p.cabinTempF != null ||
    !!p.musicPreference ||
    !!p.quietRide ||
    !!p.preferredBeverage ||
    !!p.opensOwnDoor ||
    !!p.addressTitle ||
    !!p.vipNotes
  );
}

function Item({ icon: Icon, label, value }: { icon: typeof Tag; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-primary/70 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-[10px] uppercase tracking-widest text-gray-600">{label}</p>
        <p className="text-xs text-gray-300">{value}</p>
      </div>
    </div>
  );
}

export function PassengerPreferencesPanel({
  preferences,
  /** Admin preview renders standalone rather than appended to a trip card. */
  standalone = false,
}: {
  preferences: PassengerPreferences | null | undefined;
  standalone?: boolean;
}) {
  if (!hasAnyPreference(preferences)) return null;
  const p = preferences!;

  return (
    <div className={standalone ? "" : "mt-3 pt-3 border-t border-primary/20"}>
      <p className="text-[10px] uppercase tracking-widest text-primary mb-2">Passenger Preferences</p>
      {p.vipNotes && (
        <div className="mb-3 p-2 bg-primary/10 border border-primary/30">
          <p className="text-[10px] uppercase tracking-widest text-primary mb-1">VIP Note</p>
          <p className="text-xs text-gray-200 italic">{p.vipNotes}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {p.addressTitle && <Item icon={Tag} label="Address As" value={p.addressTitle} />}
        {p.cabinTempF != null && <Item icon={Thermometer} label="Cabin Temp" value={`${p.cabinTempF}°F`} />}
        {p.musicPreference && <Item icon={Music} label="Music" value={p.musicPreference} />}
        {p.quietRide && <Item icon={Volume2} label="Quiet Ride" value="Prefers minimal conversation" />}
        {p.preferredBeverage && <Item icon={Coffee} label="Beverage" value={p.preferredBeverage} />}
        {p.opensOwnDoor && <Item icon={DoorOpen} label="Door Service" value="Opens own door" />}
      </div>
    </div>
  );
}
