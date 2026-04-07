import { useState, useEffect, useCallback } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings, Plus, X, Loader2, Plane } from "lucide-react";
import { format } from "date-fns";
import { API_BASE } from "@/lib/constants";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlacesAutocomplete } from "@/components/maps/PlacesAutocomplete";
import { AIRLINES_BY_AIRPORT } from "@/data/airlines";

type AirportCode = "FLL" | "MIA" | "PBI";
function detectAirportCode(address: string): AirportCode | null {
  const upper = address.toUpperCase();
  if (/\bFLL\b/.test(upper)) return "FLL";
  if (/\bMIA\b/.test(upper)) return "MIA";
  if (/\bPBI\b/.test(upper)) return "PBI";
  return null;
}

const adminNavItems = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Bookings", href: "/admin/bookings", icon: Calendar },
  { label: "Dispatch", href: "/admin/dispatch", icon: Map },
  { label: "Passengers", href: "/admin/passengers", icon: Users },
  { label: "Drivers", href: "/admin/drivers", icon: Users },
  { label: "Fleet", href: "/admin/fleet", icon: Car },
  { label: "Pricing", href: "/admin/pricing", icon: DollarSign },
  { label: "Promos", href: "/admin/promos", icon: Tag },
  { label: "Support", href: "/admin/support", icon: MessageSquare },
  { label: "Reports", href: "/admin/reports", icon: BarChart },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

type BookingRow = {
  id: number;
  passengerName: string;
  passengerEmail: string;
  passengerPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string;
  vehicleClass: string;
  passengers: number;
  status: string;
  priceQuoted: number;
  driverId: number | null;
  flightNumber?: string | null;
  specialRequests?: string | null;
  paymentType?: string | null;
  userRole?: string | null;
};

type DriverOption = { id: number; name: string; status: string };

const STATUS_COLORS: Record<string, string> = {
  pending:     "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  confirmed:   "text-primary bg-primary/10 border-primary/20",
  in_progress: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  completed:   "text-green-400 bg-green-400/10 border-green-400/20",
  cancelled:   "text-gray-400 bg-gray-400/10 border-gray-400/20",
};

const LABEL = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const INPUT = "bg-white/5 border-white/10 text-white rounded-none h-10 text-sm";
const SELECT = "bg-white/5 border border-white/10 text-white rounded-none h-10 text-sm px-3 w-full";

type FormData = {
  passengerName: string;
  passengerEmail: string;
  passengerPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string;
  vehicleClass: string;
  passengers: string;
  luggageCount: string;
  flightNumber: string;
  specialRequests: string;
  priceQuoted: string;
  driverId: string;
};

const EMPTY_FORM: FormData = {
  passengerName: "", passengerEmail: "", passengerPhone: "",
  pickupAddress: "", dropoffAddress: "", pickupAt: "",
  vehicleClass: "business", passengers: "1", luggageCount: "0",
  flightNumber: "", specialRequests: "", priceQuoted: "", driverId: "",
};

const VEHICLE_LIMITS = {
  business: { maxPassengers: 3, maxLuggage: 3 },
  suv:      { maxPassengers: 6, maxLuggage: 6 },
};

function Modal({ title, onClose, onSubmit, submitting, children }: {
  title: string; onClose: () => void; onSubmit: () => void;
  submitting: boolean; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-card border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-7 py-5 border-b border-border">
          <h2 className="font-serif text-xl">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-7 space-y-5">{children}</div>
        <div className="px-7 py-5 border-t border-border flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} className="rounded-none border-white/20 text-white hover:bg-white/10 text-xs uppercase tracking-widest">Cancel</Button>
          <Button onClick={onSubmit} disabled={submitting} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-6">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminBookings() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [assignDriverId, setAssignDriverId] = useState<string>("");
  const [assignSaving, setAssignSaving] = useState(false);
  const [createForm, setCreateForm] = useState<FormData>(EMPTY_FORM);
  const [createSaving, setCreateSaving] = useState(false);
  const [isGettingQuote, setIsGettingQuote] = useState(false);
  const [pickupAirline, setPickupAirline] = useState("");
  const [dropoffAirline, setDropoffAirline] = useState("");

  const authHdr = token ? `Bearer ${token}` : "";

  const pickupAirportCode = detectAirportCode(createForm.pickupAddress);
  const dropoffAirportCode = detectAirportCode(createForm.dropoffAddress);
  const limits = VEHICLE_LIMITS[createForm.vehicleClass as keyof typeof VEHICLE_LIMITS] ?? VEHICLE_LIMITS.business;

  const refetch = useCallback(() => {
    if (!token) return;
    setIsLoading(true);
    fetch(`${API_BASE}/bookings`, { headers: { Authorization: authHdr } })
      .then(r => r.ok ? r.json() as Promise<BookingRow[]> : Promise.resolve([]))
      .then(data => setBookings(Array.isArray(data) ? data : []))
      .catch(() => setBookings([]))
      .finally(() => setIsLoading(false));
  }, [token, authHdr]);

  useEffect(() => {
    refetch();
    if (!token) return;
    fetch(`${API_BASE}/drivers`, { headers: { Authorization: authHdr } })
      .then(r => r.ok ? r.json() as Promise<DriverOption[]> : Promise.resolve([]))
      .then(data => setDrivers(Array.isArray(data) ? data : []))
      .catch(() => setDrivers([]));
  }, [refetch, token, authHdr]);

  const handleCreate = async () => {
    if (!createForm.passengerName || !createForm.passengerEmail || !createForm.passengerPhone || !createForm.pickupAddress || !createForm.dropoffAddress || !createForm.pickupAt || !createForm.priceQuoted) {
      toast({ title: "Missing fields", description: "Name, email, phone, addresses, pickup time, and price are required.", variant: "destructive" });
      return;
    }
    setCreateSaving(true);
    try {
      const body = {
        passengerName: createForm.passengerName,
        passengerEmail: createForm.passengerEmail,
        passengerPhone: createForm.passengerPhone,
        pickupAddress: createForm.pickupAddress,
        dropoffAddress: createForm.dropoffAddress,
        pickupAt: new Date(createForm.pickupAt).toISOString(),
        vehicleClass: createForm.vehicleClass,
        passengers: parseInt(createForm.passengers) || 1,
        luggageCount: parseInt(createForm.luggageCount) || 0,
        flightNumber: (pickupAirline || dropoffAirline || createForm.flightNumber) ? (createForm.flightNumber || null) : null,
        specialRequests: createForm.specialRequests || null,
        priceQuoted: parseFloat(createForm.priceQuoted),
      };
      const res = await fetch(`${API_BASE}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHdr },
        body: JSON.stringify(body),
      });

      const responseBody = await res.json() as BookingRow | { error?: string };
      if (!res.ok) {
        throw new Error((responseBody as { error?: string }).error ?? "Failed to create booking");
      }
      const created = responseBody as BookingRow;

      // If driver was specified, assign immediately
      if (createForm.driverId) {
        const assignRes = await fetch(`${API_BASE}/bookings/${created.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: authHdr },
          body: JSON.stringify({ driverId: parseInt(createForm.driverId), status: "confirmed" }),
        });
        if (!assignRes.ok) {
          toast({ title: "Booking created but driver assignment failed", description: "You can assign a driver from the bookings table.", variant: "destructive" });
        }
      }

      toast({ title: "Booking created", description: "The reservation has been created." });
      setShowCreate(false);
      setCreateForm(EMPTY_FORM);
      refetch();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not create booking.", variant: "destructive" });
    }
    setCreateSaving(false);
  };

  const handleAssign = async (bookingId: number) => {
    if (!assignDriverId) return;
    setAssignSaving(true);
    try {
      const res = await fetch(`${API_BASE}/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHdr },
        body: JSON.stringify({ driverId: parseInt(assignDriverId), status: "confirmed" }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Failed to assign driver");
      }
      toast({ title: "Driver assigned", description: "The driver has been assigned to this booking." });
      setAssigningId(null);
      setAssignDriverId("");
      refetch();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not assign driver.", variant: "destructive" });
    }
    setAssignSaving(false);
  };

  const setField = (k: keyof FormData, v: string) => setCreateForm(prev => {
    const updated = { ...prev, [k]: v };
    if (k === "vehicleClass") {
      const lim = VEHICLE_LIMITS[v as keyof typeof VEHICLE_LIMITS] ?? VEHICLE_LIMITS.business;
      if (parseInt(updated.passengers) > lim.maxPassengers) updated.passengers = String(lim.maxPassengers);
      if (parseInt(updated.luggageCount) > lim.maxLuggage) updated.luggageCount = String(lim.maxLuggage);
    }
    return updated;
  });

  // Reset airline selections when airport changes
  useEffect(() => { setPickupAirline(""); }, [pickupAirportCode]);
  useEffect(() => { setDropoffAirline(""); }, [dropoffAirportCode]);

  // Auto-fetch price quote when required fields are filled
  useEffect(() => {
    if (!createForm.pickupAddress || !createForm.dropoffAddress || !createForm.pickupAt || !createForm.vehicleClass) return;
    const timeout = setTimeout(async () => {
      setIsGettingQuote(true);
      try {
        const res = await fetch(`${API_BASE}/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickupAddress: createForm.pickupAddress,
            dropoffAddress: createForm.dropoffAddress,
            vehicleClass: createForm.vehicleClass,
            passengers: parseInt(createForm.passengers) || 1,
            pickupAt: new Date(createForm.pickupAt).toISOString(),
          }),
        });
        if (res.ok) {
          const data = await res.json() as { totalWithTax?: number };
          if (data.totalWithTax != null) {
            setCreateForm(prev => ({ ...prev, priceQuoted: data.totalWithTax!.toFixed(2) }));
          }
        }
      } catch {}
      setIsGettingQuote(false);
    }, 700);
    return () => clearTimeout(timeout);
  }, [createForm.pickupAddress, createForm.dropoffAddress, createForm.pickupAt, createForm.vehicleClass, createForm.passengers]);

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 sm:mb-8 gap-3">
        <h1 className="font-serif text-2xl sm:text-3xl">All Bookings</h1>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-5 min-h-[44px] self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 mr-2" />New Booking
        </Button>
      </div>

      <div className="bg-card border border-border rounded-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[640px]">
            <thead className="bg-background/50 border-b border-border">
              <tr>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">ID</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Date</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Passenger</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs hidden md:table-cell">Route</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Status</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs hidden md:table-cell">Amount</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Driver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading...
                </td></tr>
              ) : !bookings.length ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">No bookings found.</td></tr>
              ) : bookings.map(b => (
                <>
                  <tr key={b.id} className="hover:bg-background/50 transition-colors">
                    <td className="px-5 py-4 font-medium text-muted-foreground">#{b.id}</td>
                    <td className="px-5 py-4">{format(new Date(b.pickupAt), "MMM d, yyyy HH:mm")}</td>
                    <td className="px-5 py-4">
                      <div className="font-medium">{b.passengerName}</div>
                      <div className="text-xs text-muted-foreground">{b.passengerEmail}</div>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell max-w-[180px] text-muted-foreground text-xs truncate">
                      {b.pickupAddress.split(",")[0]} → {b.dropoffAddress.split(",")[0]}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-1 border text-xs uppercase tracking-widest ${STATUS_COLORS[b.status] ?? "text-muted-foreground"}`}>
                          {b.status.replace("_", " ")}
                        </span>
                        {b.userRole === "corporate" && (
                          <span className="px-2 py-0.5 border border-purple-500/30 bg-purple-500/10 text-purple-400 text-xs uppercase tracking-widest">
                            Corporate
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell font-medium text-primary">${b.priceQuoted?.toFixed(2)}</td>
                    <td className="px-5 py-4">
                      {assigningId === b.id ? (
                        <div className="flex items-center gap-2">
                          <select
                            className="bg-black border border-white/20 text-white text-xs rounded-none h-8 px-2"
                            value={assignDriverId}
                            onChange={e => setAssignDriverId(e.target.value)}
                          >
                            <option value="">— Select —</option>
                            {drivers.filter(d => d.status === "available" || d.status === "active").map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                          <Button size="sm" disabled={!assignDriverId || assignSaving} onClick={() => handleAssign(b.id)} className="bg-primary text-black rounded-none text-xs h-8 px-3">
                            {assignSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Assign"}
                          </Button>
                          <button onClick={() => { setAssigningId(null); setAssignDriverId(""); }} className="text-muted-foreground hover:text-white text-xs">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {b.driverId ? (
                            <span className="text-xs text-green-400">Driver #{b.driverId}</span>
                          ) : (
                            <span className="text-xs text-yellow-400">Unassigned</span>
                          )}
                          {!["completed", "cancelled"].includes(b.status) && (
                            <button
                              onClick={() => { setAssigningId(b.id); setAssignDriverId(b.driverId ? String(b.driverId) : ""); }}
                              className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2"
                            >
                              {b.driverId ? "Reassign" : "Assign"}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <Modal title="New Booking" onClose={() => { setShowCreate(false); setCreateForm(EMPTY_FORM); setPickupAirline(""); setDropoffAirline(""); }} onSubmit={handleCreate} submitting={createSaving}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Passenger info */}
            <div>
              <label className={LABEL}>Passenger Name *</label>
              <Input value={createForm.passengerName} onChange={e => setField("passengerName", e.target.value)} className={INPUT} placeholder="Full name" />
            </div>
            <div>
              <label className={LABEL}>Email *</label>
              <Input type="email" value={createForm.passengerEmail} onChange={e => setField("passengerEmail", e.target.value)} className={INPUT} placeholder="passenger@email.com" />
            </div>
            <div>
              <label className={LABEL}>Phone *</label>
              <Input value={createForm.passengerPhone} onChange={e => setField("passengerPhone", e.target.value)} className={INPUT} placeholder="+1 (305) 555-0000" />
            </div>
            <div>
              <label className={LABEL}>Vehicle Class *</label>
              <select value={createForm.vehicleClass} onChange={e => setField("vehicleClass", e.target.value)} className={SELECT}>
                <option value="business">Business Class Sedan (max 3 pax / 3 bags)</option>
                <option value="suv">Premium SUV (max 6 pax / 6 bags)</option>
              </select>
            </div>

            {/* Addresses with autocomplete */}
            <div className="md:col-span-2">
              <label className={LABEL}>Pick-up Address *</label>
              <PlacesAutocomplete
                value={createForm.pickupAddress}
                onChange={v => setField("pickupAddress", v)}
                placeholder="Pick-up location"
                className={`${INPUT} w-full px-3`}
              />
            </div>
            {pickupAirportCode && (
              <div className="md:col-span-2">
                <label className={LABEL}><Plane className="w-3 h-3 inline mr-1" />Airline at {pickupAirportCode} (Pick-up)</label>
                <select value={pickupAirline} onChange={e => setPickupAirline(e.target.value)} className={SELECT}>
                  <option value="">— Select airline (optional) —</option>
                  {AIRLINES_BY_AIRPORT[pickupAirportCode].map(a => (
                    <option key={a.code} value={a.code}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="md:col-span-2">
              <label className={LABEL}>Drop-off Address *</label>
              <PlacesAutocomplete
                value={createForm.dropoffAddress}
                onChange={v => setField("dropoffAddress", v)}
                placeholder="Destination"
                className={`${INPUT} w-full px-3`}
              />
            </div>
            {dropoffAirportCode && (
              <div className="md:col-span-2">
                <label className={LABEL}><Plane className="w-3 h-3 inline mr-1" />Airline at {dropoffAirportCode} (Drop-off)</label>
                <select value={dropoffAirline} onChange={e => setDropoffAirline(e.target.value)} className={SELECT}>
                  <option value="">— Select airline (optional) —</option>
                  {AIRLINES_BY_AIRPORT[dropoffAirportCode].map(a => (
                    <option key={a.code} value={a.code}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Date/time */}
            <div>
              <label className={LABEL}>Pickup Date & Time *</label>
              <Input type="datetime-local" value={createForm.pickupAt} onChange={e => setField("pickupAt", e.target.value)} className={INPUT} />
            </div>

            {/* Passengers */}
            <div>
              <label className={LABEL}>Passengers (max {limits.maxPassengers})</label>
              <select value={createForm.passengers} onChange={e => setField("passengers", e.target.value)} className={SELECT}>
                {Array.from({ length: limits.maxPassengers }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n} {n === 1 ? "passenger" : "passengers"}</option>
                ))}
              </select>
            </div>

            {/* Luggage */}
            <div>
              <label className={LABEL}>Luggage (max {limits.maxLuggage})</label>
              <select value={createForm.luggageCount} onChange={e => setField("luggageCount", e.target.value)} className={SELECT}>
                {Array.from({ length: limits.maxLuggage + 1 }, (_, i) => i).map(n => (
                  <option key={n} value={n}>{n} {n === 1 ? "bag" : "bags"}</option>
                ))}
              </select>
            </div>

            {/* Price quoted — auto-filled from quote API */}
            <div>
              <label className={LABEL}>
                Price Quoted ($) *
                {isGettingQuote && <Loader2 className="w-3 h-3 inline-block animate-spin ml-1.5 text-primary" />}
              </label>
              <Input
                type="number"
                step="0.01"
                value={createForm.priceQuoted}
                onChange={e => setField("priceQuoted", e.target.value)}
                className={INPUT}
                placeholder={isGettingQuote ? "Calculating..." : "0.00"}
              />
              {createForm.priceQuoted && !isGettingQuote && (
                <p className="text-[10px] text-primary mt-1 uppercase tracking-widest">Auto-calculated from route</p>
              )}
            </div>

            {/* Flight number */}
            <div>
              <label className={LABEL}>Flight Number</label>
              <Input value={createForm.flightNumber} onChange={e => setField("flightNumber", e.target.value)} className={INPUT} placeholder="AA1234 (optional)" />
            </div>

            <div>
              <label className={LABEL}>Assign Driver</label>
              <select value={createForm.driverId} onChange={e => setField("driverId", e.target.value)} className={SELECT}>
                <option value="">— No driver yet —</option>
                {drivers.filter(d => d.status === "available" || d.status === "active").map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={LABEL}>Special Requests</label>
              <Input value={createForm.specialRequests} onChange={e => setField("specialRequests", e.target.value)} className={INPUT} placeholder="Any notes..." />
            </div>
          </div>
        </Modal>
      )}
    </PortalLayout>
  );
}
