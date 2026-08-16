import { useListUsers } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { Shield, Save, X, Pencil, Eye, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { adminNavItems } from "@/config/portalNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PassengerPreferencesPanel, hasAnyPreference } from "@/components/PassengerPreferencesPanel";

/**
 * The admin passenger screen.
 *
 * It used to expose exactly one editable field — VIP notes — even though the
 * cabin preferences that drive how a chauffeur stages the vehicle were already
 * stored on the same row and shown on the driver's manifest. An administrator
 * taking a preference over the phone had nowhere to put it.
 *
 * The preview on the right is not a re-drawing of that manifest: it is the same
 * PassengerPreferencesPanel the driver dashboard renders, so "what the driver
 * sees" stays true by construction rather than by everyone remembering to
 * update two screens.
 */

type Passenger = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  createdAt: string | Date;
  vipNotes?: string | null;
  cabinTempF?: number | null;
  musicPreference?: string | null;
  quietRide?: boolean | null;
  preferredBeverage?: string | null;
  opensOwnDoor?: boolean | null;
  addressTitle?: string | null;
};

const LABEL = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const INPUT = "bg-white/5 border-white/10 text-white rounded-none h-10";

/** Everything PATCH /users/:id accepts from this screen. */
type Draft = {
  name: string;
  email: string;
  phone: string;
  addressTitle: string;
  cabinTempF: string;
  musicPreference: string;
  preferredBeverage: string;
  quietRide: boolean;
  opensOwnDoor: boolean;
  vipNotes: string;
};

function toDraft(p: Passenger): Draft {
  return {
    name: p.name ?? "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    addressTitle: p.addressTitle ?? "",
    cabinTempF: p.cabinTempF != null ? String(p.cabinTempF) : "",
    musicPreference: p.musicPreference ?? "",
    preferredBeverage: p.preferredBeverage ?? "",
    quietRide: !!p.quietRide,
    opensOwnDoor: !!p.opensOwnDoor,
    vipNotes: p.vipNotes ?? "",
  };
}

function EditPassengerModal({
  passenger,
  token,
  onClose,
  onSaved,
}: {
  passenger: Passenger;
  token: string;
  onClose: () => void;
  onSaved: (updated: Passenger) => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>(() => toDraft(passenger));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v }));

  // The live preview reads from the draft, so the admin sees the effect of a
  // change before committing it.
  const preview = {
    cabinTempF: draft.cabinTempF.trim() === "" ? null : Number(draft.cabinTempF),
    musicPreference: draft.musicPreference.trim() || null,
    quietRide: draft.quietRide,
    preferredBeverage: draft.preferredBeverage.trim() || null,
    opensOwnDoor: draft.opensOwnDoor,
    addressTitle: draft.addressTitle.trim() || null,
    vipNotes: draft.vipNotes.trim() || null,
  };

  const save = async () => {
    const tempRaw = draft.cabinTempF.trim();
    if (tempRaw !== "" && (!Number.isFinite(Number(tempRaw)) || Number(tempRaw) < 55 || Number(tempRaw) > 85)) {
      toast({ title: "Check the cabin temperature", description: "Enter a value between 55 and 85 °F, or leave it blank.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/users/${passenger.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: draft.name.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim() || null,
          addressTitle: preview.addressTitle,
          cabinTempF: preview.cabinTempF,
          musicPreference: preview.musicPreference,
          preferredBeverage: preview.preferredBeverage,
          quietRide: draft.quietRide,
          opensOwnDoor: draft.opensOwnDoor,
          vipNotes: preview.vipNotes,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || `Save failed (HTTP ${res.status}).`);
      }
      onSaved({
        ...passenger,
        name: draft.name.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim() || null,
        ...preview,
      });
      toast({ title: "Passenger updated", description: `Saved changes for ${draft.name.trim()}.` });
      onClose();
    } catch (err) {
      toast({
        title: "Could not save passenger",
        description: err instanceof Error ? err.message : "Unexpected error.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-card border border-border w-full max-w-4xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-serif text-xl">Edit Passenger — {passenger.name}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
          <div className="space-y-6">
            <section>
              <h3 className="text-sm uppercase tracking-widest text-primary mb-3">Contact</h3>
              <div className="space-y-3">
                <div>
                  <label className={LABEL}>Full Name</label>
                  <Input className={INPUT} value={draft.name} onChange={e => set("name", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Email</label>
                  <Input className={INPUT} type="email" value={draft.email} onChange={e => set("email", e.target.value)} />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    This is how they sign in, and how their past bookings are matched. Change it only to correct a mistake.
                  </p>
                </div>
                <div>
                  <label className={LABEL}>Phone</label>
                  <Input className={INPUT} value={draft.phone} onChange={e => set("phone", e.target.value)} />
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm uppercase tracking-widest text-primary mb-3">Cabin Preferences</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Address As</label>
                  <Input className={INPUT} placeholder="Dr., Mr., Ms." value={draft.addressTitle} onChange={e => set("addressTitle", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Cabin Temp (°F)</label>
                  <Input className={INPUT} inputMode="numeric" placeholder="70" value={draft.cabinTempF} onChange={e => set("cabinTempF", e.target.value.replace(/[^\d]/g, "").slice(0, 2))} />
                </div>
                <div>
                  <label className={LABEL}>Music</label>
                  <Input className={INPUT} placeholder="Jazz, Classical, None" value={draft.musicPreference} onChange={e => set("musicPreference", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Beverage</label>
                  <Input className={INPUT} placeholder="Sparkling Water" value={draft.preferredBeverage} onChange={e => set("preferredBeverage", e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-2 mt-3">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={draft.quietRide} onChange={e => set("quietRide", e.target.checked)} className="accent-primary" />
                  Prefers minimal conversation
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={draft.opensOwnDoor} onChange={e => set("opensOwnDoor", e.target.checked)} className="accent-primary" />
                  Opens own door — chauffeur should not
                </label>
              </div>
            </section>

            <section>
              <h3 className="text-sm uppercase tracking-widest text-primary mb-1 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" /> VIP / Admin Notes
              </h3>
              <p className="text-[11px] text-muted-foreground mb-2">Never shown to the passenger. Appears on the chauffeur's manifest.</p>
              <textarea
                className="w-full bg-white/5 border border-white/10 text-sm text-white p-3 resize-none focus:outline-none focus:border-primary placeholder:text-gray-600"
                rows={3}
                placeholder="e.g. CEO of Acme Corp · Prefers front-of-terminal pickup"
                value={draft.vipNotes}
                onChange={e => set("vipNotes", e.target.value)}
              />
            </section>
          </div>

          <div>
            <h3 className="text-sm uppercase tracking-widest text-primary mb-1 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> What the chauffeur sees
            </h3>
            <p className="text-[11px] text-muted-foreground mb-3">
              The same panel that appears on the driver's trip manifest, updating as you type.
            </p>
            <div className="border border-primary/20 bg-black/40 p-4 min-h-[160px]">
              {hasAnyPreference(preview) ? (
                <PassengerPreferencesPanel preferences={preview} standalone />
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No preferences set — the chauffeur sees no preference panel for this passenger.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose} className="rounded-none border-white/20 text-xs uppercase tracking-widest px-6">Cancel</Button>
          <Button onClick={() => void save()} disabled={saving} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-6">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : <><Save className="w-4 h-4 mr-2" />Save</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPassengers() {
  const { data: rawPassengers, isLoading } = useListUsers({ role: "passenger" });
  const { token } = useAuth();
  const [overrides, setOverrides] = useState<Record<number, Partial<Passenger>>>({});
  const [editing, setEditing] = useState<Passenger | null>(null);

  const passengers: Passenger[] = (rawPassengers ?? []).map(p => ({
    ...(p as unknown as Passenger),
    createdAt: typeof p.createdAt === "string" ? p.createdAt : (p.createdAt as Date).toISOString(),
    ...(overrides[p.id] ?? {}),
  }));

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <h1 className="font-serif text-2xl sm:text-3xl mb-2">Passengers</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Edit contact details, cabin preferences and VIP notes — and preview exactly what the chauffeur will see.
      </p>

      <div className="bg-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[720px]">
            <thead className="bg-background/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium text-muted-foreground">ID</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Name</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Email</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Phone</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Preferences</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Joined</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">Loading passengers...</td></tr>
              ) : passengers.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">No passengers yet.</td></tr>
              ) : passengers.map(p => {
                const hasNotes = !!p.vipNotes?.trim();
                const prefCount = [
                  p.cabinTempF != null, !!p.musicPreference, !!p.quietRide,
                  !!p.preferredBeverage, !!p.opensOwnDoor, !!p.addressTitle,
                ].filter(Boolean).length;
                return (
                  <tr key={p.id} className="hover:bg-background/50">
                    <td className="px-6 py-4 font-medium text-muted-foreground">#{p.id}</td>
                    <td className="px-6 py-4 font-medium">
                      <div className="flex items-center gap-2">
                        {p.name}
                        {hasNotes && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-widest bg-primary/10 text-primary border border-primary/20">
                            <Shield className="w-2.5 h-2.5" /> VIP
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{p.email}</td>
                    <td className="px-6 py-4 text-muted-foreground">{p.phone ?? "—"}</td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {prefCount > 0
                        ? <span className="text-primary">{prefCount} set</span>
                        : <span className="text-muted-foreground/50">none</span>}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{format(new Date(p.createdAt), "MMM d, yyyy")}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setEditing(p)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-white/20 text-xs uppercase tracking-widest text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EditPassengerModal
          passenger={editing}
          token={token ?? ""}
          onClose={() => setEditing(null)}
          onSaved={updated => setOverrides(o => ({ ...o, [updated.id]: updated }))}
        />
      )}
    </PortalLayout>
  );
}
