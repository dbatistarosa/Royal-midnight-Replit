import { useState, useEffect } from "react";
import { X, Save, Loader2, Lock, Mail, AlertTriangle, CreditCard, Send, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/constants";
import { TripExtras, type TripExtra } from "@/components/TripExtrasAndCharter";

/**
 * Full reservation editing.
 *
 * PATCH /bookings/:id only ever accepted status, driver, vehicle and special
 * requests, so everything a customer actually calls to change — the time, the
 * day, where they are going, who is travelling — meant cancelling and
 * rebooking. This talks to PATCH /admin/bookings/:id/details instead.
 *
 * On a reservation the customer has already paid for, the fields that move the
 * fare are locked rather than silently re-charged. The server enforces that
 * independently; disabling the inputs here just means the admin finds out
 * before typing rather than after submitting.
 */

export type EditableBooking = {
  id: number;
  passengerName: string;
  passengerEmail: string;
  passengerPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string;
  vehicleClass: string;
  passengers: number;
  luggageCount?: number | null;
  flightNumber?: string | null;
  specialRequests?: string | null;
  status: string;
  priceQuoted: number;
  stripePaymentIntentId?: string | null;
  extras?: TripExtra[] | null;
};

type ExtraService = { id: number; name: string; category: string; price: number };

type AddonPreview = {
  extrasTotal: number;
  taxAmount: number;
  cardProcessingFee: number;
  total: number;
  hasCardOnFile: boolean;
};

const LABEL = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const INPUT = "bg-white/5 border-white/10 text-white rounded-none h-10 text-sm";
const SELECT = "w-full bg-white/5 border border-white/10 text-white px-3 h-10 text-sm focus:outline-none focus:border-primary rounded-none";

/**
 * Mirrors isPaidBooking() on the server. Kept as a hint for the UI only — the
 * server decides, and answers 409 with the locked field list if this disagrees.
 */
function looksPaid(b: EditableBooking): boolean {
  if (b.status === "completed") return true;
  return !!b.stripePaymentIntentId && b.status !== "awaiting_payment" && b.status !== "cancelled";
}

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in the *browser's* zone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditBookingModal({
  booking,
  token,
  onClose,
  onSaved,
}: {
  booking: EditableBooking;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const paid = looksPaid(booking);

  // Add-ons on a paid reservation. Editing the itinerary is locked once money
  // has moved (see the note above), but a passenger calling to add a car seat
  // isn't changing the trip — it's money owed on top of it, so it goes through
  // a separate charge-or-invoice flow instead of the price-affecting fields.
  const [currentExtras, setCurrentExtras] = useState<TripExtra[]>(booking.extras ?? []);
  const [availableExtras, setAvailableExtras] = useState<ExtraService[]>([]);
  const [selectedAddon, setSelectedAddon] = useState<Record<number, number>>({});
  const [addonPreview, setAddonPreview] = useState<AddonPreview | null>(null);
  const [addonPreviewLoading, setAddonPreviewLoading] = useState(false);
  const [addonSubmitting, setAddonSubmitting] = useState<"card" | "invoice" | null>(null);

  useEffect(() => {
    if (!paid) return;
    fetch(`${API_BASE}/extras`)
      .then(r => r.ok ? r.json() as Promise<ExtraService[]> : Promise.resolve([]))
      .then(data => setAvailableExtras(Array.isArray(data) ? data : []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid]);

  const selectedAddonList = Object.entries(selectedAddon).filter(([, qty]) => qty > 0);

  useEffect(() => {
    if (!paid || selectedAddonList.length === 0) { setAddonPreview(null); return; }
    setAddonPreviewLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/bookings/${booking.id}/extras/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ extras: selectedAddonList.map(([id, quantity]) => ({ id: Number(id), quantity })) }),
        });
        setAddonPreview(res.ok ? await res.json() as AddonPreview : null);
      } catch {
        setAddonPreview(null);
      }
      setAddonPreviewLoading(false);
    }, 500);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(selectedAddon), paid, booking.id, token]);

  const submitAddon = async (method: "card" | "invoice") => {
    if (selectedAddonList.length === 0) return;
    setAddonSubmitting(method);
    try {
      const res = await fetch(`${API_BASE}/admin/bookings/${booking.id}/extras`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          method,
          extras: selectedAddonList.map(([id, quantity]) => ({ id: Number(id), quantity })),
        }),
      });
      const data = await res.json().catch(() => null) as { error?: string; extras?: TripExtra[]; charge?: { total: number } } | null;
      if (!res.ok) throw new Error(data?.error || `Could not add the extras (HTTP ${res.status}).`);

      setCurrentExtras(data?.extras ?? currentExtras);
      setSelectedAddon({});
      setAddonPreview(null);
      toast({
        title: method === "card" ? "Add-ons charged" : "Invoice sent",
        description: method === "card"
          ? `$${(data?.charge?.total ?? 0).toFixed(2)} charged to the card on file.`
          : `A $${(data?.charge?.total ?? 0).toFixed(2)} invoice was emailed to the passenger.`,
      });
      onSaved();
    } catch (err) {
      toast({
        title: "Could not add the extras",
        description: err instanceof Error ? err.message : "Unexpected error.",
        variant: "destructive",
      });
    } finally {
      setAddonSubmitting(null);
    }
  };

  const [f, setF] = useState({
    passengerName: booking.passengerName ?? "",
    passengerEmail: booking.passengerEmail ?? "",
    passengerPhone: booking.passengerPhone ?? "",
    pickupAddress: booking.pickupAddress ?? "",
    dropoffAddress: booking.dropoffAddress ?? "",
    pickupAt: toLocalInput(booking.pickupAt),
    vehicleClass: booking.vehicleClass ?? "business",
    passengers: String(booking.passengers ?? 1),
    luggageCount: String(booking.luggageCount ?? 0),
    flightNumber: booking.flightNumber ?? "",
    specialRequests: booking.specialRequests ?? "",
  });
  const [notifyPassenger, setNotifyPassenger] = useState(true);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    const when = new Date(f.pickupAt);
    if (Number.isNaN(when.getTime())) {
      toast({ title: "Check the pickup date", description: "That date and time could not be read.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        passengerName: f.passengerName.trim(),
        passengerEmail: f.passengerEmail.trim(),
        passengerPhone: f.passengerPhone.trim(),
        pickupAt: when.toISOString(),
        passengers: Number(f.passengers) || 1,
        luggageCount: Number(f.luggageCount) || 0,
        flightNumber: f.flightNumber.trim() || null,
        specialRequests: f.specialRequests.trim() || null,
        notifyPassenger,
      };
      // Price-affecting fields are omitted entirely on a paid booking, so an
      // unchanged value can never be mistaken for an attempted change.
      if (!paid) {
        body.pickupAddress = f.pickupAddress.trim();
        body.dropoffAddress = f.dropoffAddress.trim();
        body.vehicleClass = f.vehicleClass;
      }

      const res = await fetch(`${API_BASE}/admin/bookings/${booking.id}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(b?.error || `Save failed (HTTP ${res.status}).`);
      }
      const result = await res.json() as { changes?: Array<{ label: string }>; repricedFrom?: number | null; booking?: { priceQuoted?: number } };
      const changed = result.changes?.length ?? 0;

      toast({
        title: changed > 0 ? `Reservation updated — ${changed} change${changed === 1 ? "" : "s"}` : "Nothing to change",
        description: result.repricedFrom != null && result.booking?.priceQuoted != null
          ? `Fare recalculated: $${result.repricedFrom.toFixed(2)} → $${result.booking.priceQuoted.toFixed(2)}.`
          : notifyPassenger && changed > 0
            ? "The passenger has been emailed a summary of what changed."
            : undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      toast({
        title: "Could not save reservation",
        description: err instanceof Error ? err.message : "Unexpected error.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-card border border-border w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-serif text-xl">Edit Reservation #{booking.id}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-6">
          {paid && (
            <div className="flex items-start gap-2 border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-xs text-amber-200">
              <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                This reservation has been paid, so the addresses and vehicle class are locked — changing them would change
                the fare on a card that has already been charged. Everything else can still be edited. To change the trip
                itself, cancel and rebook.
              </span>
            </div>
          )}

          <section>
            <h3 className="text-sm uppercase tracking-widest text-primary mb-3">Schedule</h3>
            <div>
              <label className={LABEL}>Pickup Date &amp; Time</label>
              <Input className={INPUT} type="datetime-local" value={f.pickupAt} onChange={e => set("pickupAt", e.target.value)} />
              <p className="text-[11px] text-muted-foreground mt-1">Entered in your local time. Editable even on paid reservations.</p>
            </div>
          </section>

          <section>
            <h3 className="text-sm uppercase tracking-widest text-primary mb-3">
              Itinerary {paid && <span className="text-amber-300/70 normal-case tracking-normal text-xs ml-1">— locked</span>}
            </h3>
            <div className="space-y-3">
              <div>
                <label className={LABEL}>Pick-up Address</label>
                <Input className={INPUT} disabled={paid} value={f.pickupAddress} onChange={e => set("pickupAddress", e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Drop-off Address</label>
                <Input className={INPUT} disabled={paid} value={f.dropoffAddress} onChange={e => set("dropoffAddress", e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={LABEL}>Vehicle</label>
                  <select className={SELECT} disabled={paid} value={f.vehicleClass} onChange={e => set("vehicleClass", e.target.value)}>
                    <option value="business">Business Class Sedan</option>
                    <option value="suv">Premium SUV</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Passengers</label>
                  <Input className={INPUT} inputMode="numeric" value={f.passengers} onChange={e => set("passengers", e.target.value.replace(/\D/g, "").slice(0, 2))} />
                </div>
                <div>
                  <label className={LABEL}>Luggage</label>
                  <Input className={INPUT} inputMode="numeric" value={f.luggageCount} onChange={e => set("luggageCount", e.target.value.replace(/\D/g, "").slice(0, 2))} />
                </div>
              </div>
              {!paid && (
                <p className="text-[11px] text-muted-foreground">
                  Changing an address or the vehicle recalculates the fare with the same engine the booking form uses.
                </p>
              )}
            </div>
          </section>

          {paid && (
            <section>
              <h3 className="text-sm uppercase tracking-widest text-primary mb-3 flex items-center gap-1.5">
                <PackagePlus className="w-3.5 h-3.5" /> Add-ons
              </h3>

              <TripExtras extras={currentExtras} audience="admin" />

              {availableExtras.length > 0 && (
                <div className="mt-3 border border-white/10 divide-y divide-white/10">
                  {availableExtras.map(extra => {
                    const qty = selectedAddon[extra.id] ?? 0;
                    return (
                      <div key={extra.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <label className="flex items-center gap-2.5 flex-1 cursor-pointer min-w-0">
                          <input
                            type="checkbox"
                            checked={qty > 0}
                            onChange={e => setSelectedAddon(prev => {
                              const next = { ...prev };
                              if (e.target.checked) next[extra.id] = 1; else delete next[extra.id];
                              return next;
                            })}
                            className="accent-primary shrink-0"
                          />
                          <span className="text-sm text-white truncate">{extra.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">${extra.price.toFixed(2)}</span>
                        </label>
                        {qty > 0 && (
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={qty}
                            onChange={e => setSelectedAddon(prev => ({ ...prev, [extra.id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                            className="bg-white/5 border border-white/10 text-white text-xs h-8 w-14 text-center rounded-none"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedAddonList.length > 0 && (
                <div className="mt-3 border border-primary/30 bg-primary/5 px-4 py-3">
                  {addonPreviewLoading ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Pricing…</p>
                  ) : addonPreview ? (
                    <>
                      <p className="text-sm text-white">
                        This will add <strong className="text-primary">${addonPreview.total.toFixed(2)}</strong>
                        {" "}(${addonPreview.extrasTotal.toFixed(2)} + tax &amp; card fee) to the total.
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {addonPreview.hasCardOnFile ? (
                          <Button
                            onClick={() => void submitAddon("card")}
                            disabled={addonSubmitting !== null}
                            className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-4 h-9"
                          >
                            {addonSubmitting === "card"
                              ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Charging…</>
                              : <><CreditCard className="w-3.5 h-3.5 mr-1.5" />Charge ${addonPreview.total.toFixed(2)} to card on file</>}
                          </Button>
                        ) : (
                          <Button
                            onClick={() => void submitAddon("invoice")}
                            disabled={addonSubmitting !== null}
                            className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-4 h-9"
                          >
                            {addonSubmitting === "invoice"
                              ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Sending…</>
                              : <><Send className="w-3.5 h-3.5 mr-1.5" />Send ${addonPreview.total.toFixed(2)} invoice by email</>}
                          </Button>
                        )}
                      </div>
                      {!addonPreview.hasCardOnFile && (
                        <p className="text-[11px] text-amber-300/80 mt-2">
                          No saved card on file for this passenger — this sends a one-off Stripe invoice for just the add-ons instead of charging automatically.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-red-400">Could not price these add-ons. Try again.</p>
                  )}
                </div>
              )}
            </section>
          )}

          <section>
            <h3 className="text-sm uppercase tracking-widest text-primary mb-3">Passenger</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Name</label>
                <Input className={INPUT} value={f.passengerName} onChange={e => set("passengerName", e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Phone</label>
                <Input className={INPUT} value={f.passengerPhone} onChange={e => set("passengerPhone", e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Email</label>
                <Input className={INPUT} type="email" value={f.passengerEmail} onChange={e => set("passengerEmail", e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Flight</label>
                <Input className={INPUT} placeholder="AA1234" value={f.flightNumber} onChange={e => set("flightNumber", e.target.value)} />
              </div>
            </div>
            <div className="mt-3">
              <label className={LABEL}>Special Requests</label>
              <textarea
                className="w-full bg-white/5 border border-white/10 text-sm text-white p-3 resize-none focus:outline-none focus:border-primary placeholder:text-gray-600"
                rows={2}
                value={f.specialRequests}
                onChange={e => set("specialRequests", e.target.value)}
              />
            </div>
          </section>

          <label className={`flex items-start gap-3 border px-4 py-3 cursor-pointer transition-colors ${notifyPassenger ? "border-primary/50 bg-primary/5" : "border-white/12 hover:border-white/25"}`}>
            <input type="checkbox" checked={notifyPassenger} onChange={e => setNotifyPassenger(e.target.checked)} className="accent-primary mt-0.5" />
            <span>
              <span className="text-sm text-white flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-primary" />Email the passenger what changed</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Sends only the fields that actually changed, old value beside new. Off means they are never told.
              </span>
            </span>
          </label>

          {!notifyPassenger && (
            <p className="flex items-start gap-2 text-[11px] text-amber-300/80">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              Changing a pickup time without telling the passenger is how a ride gets missed.
            </p>
          )}
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
