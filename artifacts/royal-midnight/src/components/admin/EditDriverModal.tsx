import { useState, useEffect } from "react";
import { X, Save, Loader2, MapPin, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/constants";

/**
 * Full driver editing.
 *
 * The previous modal reached nine fields. An administrator could change the
 * vehicle make but not its plate, the name but not the licence expiry, and
 * nothing at all about insurance, registration, approval standing or which
 * areas the driver works. Everything on the driver record that is safe to type
 * is here, backed by PATCH /admin/drivers/:id/details.
 *
 * Banking details are deliberately absent: they live behind the payout
 * endpoints, which encrypt on write and never read the values back. Putting
 * them in a general edit form would mean duplicating that handling or losing
 * it. Documents are equally absent — they are uploaded and reviewed, not typed.
 */

export type EditableDriver = {
  id: number;
  name: string;
  email: string;
  phone: string;
  status?: string;
  approvalStatus?: string;
  complianceHold?: boolean | null;
  rating?: number | null;
  licenseNumber?: string | null;
  licenseExpiry?: string | null;
  vehicleYear?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleColor?: string | null;
  vehicleClass?: string | null;
  passengerCapacity?: number | null;
  luggageCapacity?: number | null;
  hasCarSeat?: boolean | null;
  regVin?: string | null;
  regPlate?: string | null;
  regExpiry?: string | null;
  insuranceExpiry?: string | null;
  serviceArea?: string | null;
};

type ServiceZone = { id: number; name: string; description: string | null; isServiceArea: boolean; isActive: boolean };

const LABEL = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const INPUT = "bg-white/5 border-white/10 text-white rounded-none h-10";
const SELECT = "w-full bg-white/5 border border-white/10 text-white px-3 h-10 text-sm focus:outline-none focus:border-primary rounded-none";

/** Empty string means "clear this column", which is what the server expects. */
const text = (v: string | null | undefined) => v ?? "";
const num = (v: number | null | undefined) => (v == null ? "" : String(v));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm uppercase tracking-widest text-primary mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export function EditDriverModal({
  driver,
  token,
  onClose,
  onSaved,
}: {
  driver: EditableDriver;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [f, setF] = useState({
    name: text(driver.name),
    email: text(driver.email),
    phone: text(driver.phone),
    licenseNumber: text(driver.licenseNumber),
    licenseExpiry: text(driver.licenseExpiry),
    vehicleYear: text(driver.vehicleYear),
    vehicleMake: text(driver.vehicleMake),
    vehicleModel: text(driver.vehicleModel),
    vehicleColor: text(driver.vehicleColor),
    vehicleClass: text(driver.vehicleClass),
    passengerCapacity: num(driver.passengerCapacity),
    luggageCapacity: num(driver.luggageCapacity),
    hasCarSeat: !!driver.hasCarSeat,
    regVin: text(driver.regVin),
    regPlate: text(driver.regPlate),
    regExpiry: text(driver.regExpiry),
    insuranceExpiry: text(driver.insuranceExpiry),
    status: driver.status ?? "pending",
    approvalStatus: driver.approvalStatus ?? "pending",
    complianceHold: !!driver.complianceHold,
    rating: driver.rating != null ? String(driver.rating) : "",
    serviceArea: text(driver.serviceArea),
  });

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(p => ({ ...p, [k]: v }));

  const [zones, setZones] = useState<ServiceZone[]>([]);
  const [zoneIds, setZoneIds] = useState<number[]>([]);
  // Null until both requests settle, so the checkbox list does not flash empty
  // and get saved as "assigned to nothing".
  const [zonesReady, setZonesReady] = useState(false);
  const [zonesAvailable, setZonesAvailable] = useState(true);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_BASE}/admin/geo-zones`, { headers })
        .then(r => (r.ok ? (r.json() as Promise<ServiceZone[]>) : []))
        .catch(() => [] as ServiceZone[]),
      fetch(`${API_BASE}/admin/drivers/${driver.id}/service-zones`, { headers })
        .then(r => (r.ok ? (r.json() as Promise<{ zoneIds: number[]; available: boolean }>) : { zoneIds: [], available: false }))
        .catch(() => ({ zoneIds: [], available: false })),
    ]).then(([allZones, assigned]) => {
      setZones((allZones ?? []).filter(z => z.isServiceArea && z.isActive));
      setZoneIds(assigned.zoneIds ?? []);
      setZonesAvailable(assigned.available !== false);
      setZonesReady(true);
    });
  }, [driver.id, token]);

  const toggleZone = (id: number) =>
    setZoneIds(cur => (cur.includes(id) ? cur.filter(z => z !== id) : [...cur, id]));

  const save = async () => {
    if (f.rating !== "" && (!Number.isFinite(Number(f.rating)) || Number(f.rating) < 0 || Number(f.rating) > 5)) {
      toast({ title: "Check the rating", description: "Enter a value between 0 and 5, or leave it blank.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: f.name.trim(),
        email: f.email.trim(),
        phone: f.phone.trim(),
        licenseNumber: f.licenseNumber.trim() || null,
        licenseExpiry: f.licenseExpiry.trim() || null,
        vehicleYear: f.vehicleYear.trim() || null,
        vehicleMake: f.vehicleMake.trim() || null,
        vehicleModel: f.vehicleModel.trim() || null,
        vehicleColor: f.vehicleColor.trim() || null,
        vehicleClass: f.vehicleClass.trim() || null,
        passengerCapacity: f.passengerCapacity === "" ? null : Number(f.passengerCapacity),
        luggageCapacity: f.luggageCapacity === "" ? null : Number(f.luggageCapacity),
        hasCarSeat: f.hasCarSeat,
        regVin: f.regVin.trim() || null,
        regPlate: f.regPlate.trim() || null,
        regExpiry: f.regExpiry.trim() || null,
        insuranceExpiry: f.insuranceExpiry.trim() || null,
        status: f.status,
        approvalStatus: f.approvalStatus,
        complianceHold: f.complianceHold,
        rating: f.rating === "" ? null : Number(f.rating),
        serviceArea: f.serviceArea.trim() || null,
      };
      // Only sent when the list actually loaded, so a failed zone fetch can
      // never be saved as "this driver works nowhere".
      if (zonesReady && zonesAvailable) body.serviceZoneIds = zoneIds;

      const res = await fetch(`${API_BASE}/admin/drivers/${driver.id}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(b?.error || `Save failed (HTTP ${res.status}).`);
      }
      toast({ title: "Driver updated", description: `Saved changes for ${f.name.trim()}.` });
      onSaved();
      onClose();
    } catch (err) {
      toast({
        title: "Could not save driver",
        description: err instanceof Error ? err.message : "Unexpected error.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const emailChanged = f.email.trim().toLowerCase() !== driver.email.toLowerCase();

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-card border border-border w-full max-w-3xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-serif text-xl">Edit Driver — {driver.name}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-7">
          <Section title="Identity">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Full Name">
                <Input className={INPUT} value={f.name} onChange={e => set("name", e.target.value)} />
              </Field>
              <Field label="Phone">
                <Input className={INPUT} value={f.phone} onChange={e => set("phone", e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field
                  label="Email"
                  hint={emailChanged ? "This is the driver's login. Saving updates their sign-in address too." : undefined}
                >
                  <Input className={INPUT} type="email" value={f.email} onChange={e => set("email", e.target.value)} />
                </Field>
              </div>
              <Field label="License Number">
                <Input className={INPUT} value={f.licenseNumber} onChange={e => set("licenseNumber", e.target.value)} />
              </Field>
              <Field label="License Expiry" hint="YYYY-MM-DD">
                <Input className={INPUT} placeholder="2027-04-30" value={f.licenseExpiry} onChange={e => set("licenseExpiry", e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Vehicle">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Year"><Input className={INPUT} placeholder="2026" value={f.vehicleYear} onChange={e => set("vehicleYear", e.target.value)} /></Field>
              <Field label="Make"><Input className={INPUT} placeholder="Cadillac" value={f.vehicleMake} onChange={e => set("vehicleMake", e.target.value)} /></Field>
              <Field label="Model"><Input className={INPUT} placeholder="Escalade" value={f.vehicleModel} onChange={e => set("vehicleModel", e.target.value)} /></Field>
              <Field label="Color"><Input className={INPUT} placeholder="Black" value={f.vehicleColor} onChange={e => set("vehicleColor", e.target.value)} /></Field>
              <Field label="Class" hint="business, suv…"><Input className={INPUT} value={f.vehicleClass} onChange={e => set("vehicleClass", e.target.value)} /></Field>
              <Field label="Passengers"><Input className={INPUT} inputMode="numeric" value={f.passengerCapacity} onChange={e => set("passengerCapacity", e.target.value.replace(/\D/g, "").slice(0, 2))} /></Field>
              <Field label="Luggage"><Input className={INPUT} inputMode="numeric" value={f.luggageCapacity} onChange={e => set("luggageCapacity", e.target.value.replace(/\D/g, "").slice(0, 2))} /></Field>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={f.hasCarSeat} onChange={e => set("hasCarSeat", e.target.checked)} className="accent-primary" />
                  Car seat
                </label>
              </div>
            </div>
          </Section>

          <Section title="Registration & Insurance">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="VIN"><Input className={INPUT} value={f.regVin} onChange={e => set("regVin", e.target.value)} /></Field>
              <Field label="Plate"><Input className={INPUT} value={f.regPlate} onChange={e => set("regPlate", e.target.value)} /></Field>
              <Field label="Registration Expiry" hint="YYYY-MM-DD"><Input className={INPUT} placeholder="2027-01-31" value={f.regExpiry} onChange={e => set("regExpiry", e.target.value)} /></Field>
              <Field label="Insurance Expiry" hint="YYYY-MM-DD"><Input className={INPUT} placeholder="2027-01-31" value={f.insuranceExpiry} onChange={e => set("insuranceExpiry", e.target.value)} /></Field>
            </div>
          </Section>

          <Section title="Service Areas">
            {!zonesReady ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading areas…</div>
            ) : !zonesAvailable ? (
              <div className="flex items-start gap-2 border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                Service areas are not enabled on this database yet — migration 0009 has not been applied. Until then every approved driver sees every trip.
              </div>
            ) : zones.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No zones are marked as service areas yet. Create them under <span className="text-primary">Geo Zones</span> and tick
                “Drivers can be assigned to this area”.
              </p>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground mb-3">
                  This driver only sees trips picking up inside the areas ticked here. A trip that no assigned driver covers stays
                  visible to everyone so it is never lost.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {zones.map(z => (
                    <label
                      key={z.id}
                      className={`flex items-start gap-2 border px-3 py-2 cursor-pointer transition-colors ${
                        zoneIds.includes(z.id) ? "border-primary/50 bg-primary/5" : "border-white/10 hover:border-white/25"
                      }`}
                    >
                      <input type="checkbox" checked={zoneIds.includes(z.id)} onChange={() => toggleZone(z.id)} className="accent-primary mt-0.5" />
                      <span>
                        <span className="text-sm text-white flex items-center gap-1.5"><MapPin className="w-3 h-3 text-primary" />{z.name}</span>
                        {z.description && <span className="block text-[11px] text-muted-foreground">{z.description}</span>}
                      </span>
                    </label>
                  ))}
                </div>
                {zoneIds.length === 0 && (
                  <p className="text-[11px] text-amber-300/80 mt-2">
                    With no area ticked, this driver sees only trips that fall outside every staffed area.
                  </p>
                )}
              </>
            )}
            <div className="mt-4">
              <Field label="Legacy Area Label" hint="Free text from onboarding. Kept for reference; the tick-boxes above are what the trip pool uses.">
                <Input className={INPUT} value={f.serviceArea} onChange={e => set("serviceArea", e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Standing">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Approval">
                <select className={SELECT} value={f.approvalStatus} onChange={e => set("approvalStatus", e.target.value)}>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </Field>
              <Field label="Status">
                <select className={SELECT} value={f.status} onChange={e => set("status", e.target.value)}>
                  <option value="pending">Pending</option>
                  <option value="available">Available</option>
                  <option value="busy">Busy</option>
                  <option value="offline">Offline</option>
                  <option value="paused">Paused</option>
                </select>
              </Field>
              <Field label="Rating" hint="0–5, blank to clear">
                <Input className={INPUT} inputMode="decimal" value={f.rating} onChange={e => set("rating", e.target.value.replace(/[^\d.]/g, "").slice(0, 4))} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer mt-3">
              <input type="checkbox" checked={f.complianceHold} onChange={e => set("complianceHold", e.target.checked)} className="accent-primary" />
              Compliance hold — blocks this driver from accepting trips
            </label>
          </Section>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border sticky bottom-0 bg-card">
          <Button variant="outline" onClick={onClose} className="rounded-none border-white/20 text-xs uppercase tracking-widest px-6">Cancel</Button>
          <Button onClick={() => void save()} disabled={saving} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-6">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : <><Save className="w-4 h-4 mr-2" />Save Changes</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
