import { useState, useEffect, useCallback } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { LayoutDashboard, History, DollarSign, BarChart2, FileText, User, Car, Plus, Trash2, Star, Loader2, X } from "lucide-react";
import { API_BASE } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const driverNavItems = [
  { label: "Dashboard", href: "/driver/dashboard", icon: LayoutDashboard },
  { label: "Finished",  href: "/driver/history",   icon: History },
  { label: "Earnings",  href: "/driver/earnings",  icon: DollarSign },
  { label: "Stats",     href: "/driver/stats",     icon: BarChart2 },
  { label: "Documents", href: "/driver/documents", icon: FileText },
  { label: "Vehicles",  href: "/driver/vehicles",  icon: Car },
  { label: "Profile",   href: "/driver/profile",   icon: User },
];

type DriverVehicle = {
  id: number; driverId: number; year: string | null; make: string | null; model: string | null;
  color: string | null; vehicleClass: string | null; passengerCapacity: number | null;
  luggageCapacity: number | null; hasCarSeat: boolean; regPlate: string | null; isDefault: boolean;
};

const LABEL = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const FINPUT = "bg-white/5 border-white/10 text-white rounded-none h-10 text-sm";

function VehiclesInner() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const authHdr = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const [driverId, setDriverId] = useState<number | null>(null);
  const [vehicles, setVehicles] = useState<DriverVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ year: "", make: "", model: "", color: "", vehicleClass: "business", passengerCapacity: "", luggageCapacity: "", hasCarSeat: false, regPlate: "" });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const loadDriver = useCallback(async () => {
    if (!user || !token) return;
    const r = await fetch(`${API_BASE}/drivers/by-user/${user.id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) { const d = await r.json() as { id: number }; setDriverId(d.id); }
  }, [user, token]);

  const loadVehicles = useCallback(async () => {
    if (!driverId || !token) return;
    setLoading(true);
    const r = await fetch(`${API_BASE}/drivers/${driverId}/vehicles`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) setVehicles(await r.json() as DriverVehicle[]);
    setLoading(false);
  }, [driverId, token]);

  useEffect(() => { void loadDriver(); }, [loadDriver]);
  useEffect(() => { if (driverId) void loadVehicles(); }, [driverId, loadVehicles]);

  const handleAdd = async () => {
    if (!form.make || !form.model) { toast({ title: "Make and model required", variant: "destructive" }); return; }
    if (!driverId) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/drivers/${driverId}/vehicles`, {
        method: "POST", headers: authHdr,
        body: JSON.stringify({
          ...form,
          passengerCapacity: form.passengerCapacity ? parseInt(form.passengerCapacity) : null,
          luggageCapacity: form.luggageCapacity ? parseInt(form.luggageCapacity) : null,
          isDefault: vehicles.length === 0,
        }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "Failed");
      toast({ title: "Vehicle added" });
      setShowAdd(false);
      setForm({ year: "", make: "", model: "", color: "", vehicleClass: "business", passengerCapacity: "", luggageCapacity: "", hasCarSeat: false, regPlate: "" });
      void loadVehicles();
    } catch (e: unknown) { toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" }); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!driverId) return;
    setDeleting(id);
    await fetch(`${API_BASE}/drivers/${driverId}/vehicles/${id}`, { method: "DELETE", headers: authHdr });
    void loadVehicles();
    setDeleting(null);
  };

  const handleSetDefault = async (id: number) => {
    if (!driverId) return;
    await fetch(`${API_BASE}/drivers/${driverId}/vehicles/${id}`, { method: "PATCH", headers: authHdr, body: JSON.stringify({ isDefault: true }) });
    void loadVehicles();
  };

  return (
    <PortalLayout title="Driver Portal" navItems={driverNavItems}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl mb-1">My Vehicles</h1>
          <p className="text-sm text-muted-foreground">When you accept a trip, you'll choose which vehicle you're using if you have more than one registered.</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-5">
          <Plus className="w-4 h-4 mr-2" />Add Vehicle
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading vehicles…</div>
      ) : vehicles.length === 0 ? (
        <div className="bg-card border border-border p-8 text-center">
          <Car className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">No vehicles registered yet.</p>
          <Button onClick={() => setShowAdd(true)} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-5">Add Your First Vehicle</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {vehicles.map(v => (
            <div key={v.id} className={`bg-card border p-5 flex items-start gap-4 ${v.isDefault ? "border-primary/40" : "border-border"}`}>
              <Car className={`w-6 h-6 mt-0.5 flex-shrink-0 ${v.isDefault ? "text-primary" : "text-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium">{[v.color, v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle"}</p>
                  {v.isDefault && <span className="text-[10px] uppercase tracking-widest bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">Default</span>}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {v.vehicleClass && <span className="capitalize">{v.vehicleClass.replace("_", " ")}</span>}
                  {v.passengerCapacity != null && <span>{v.passengerCapacity} passengers</span>}
                  {v.regPlate && <span className="font-mono">{v.regPlate}</span>}
                  {v.hasCarSeat && <span>Has car seat</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {!v.isDefault && (
                  <button onClick={() => handleSetDefault(v.id)} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                    <Star className="w-3.5 h-3.5" /> Set default
                  </button>
                )}
                <button onClick={() => handleDelete(v.id)} disabled={deleting === v.id} className="text-red-400/60 hover:text-red-400 transition-colors ml-1">
                  {deleting === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-card border border-border w-full max-w-md">
            <div className="flex items-center justify-between px-7 py-5 border-b border-border">
              <h2 className="font-serif text-xl">Add Vehicle</h2>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-7 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div><label className={LABEL}>Make *</label><Input value={form.make} onChange={e => setForm(p => ({ ...p, make: e.target.value }))} className={FINPUT} placeholder="Mercedes-Benz" /></div>
                <div><label className={LABEL}>Model *</label><Input value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} className={FINPUT} placeholder="S-Class" /></div>
                <div><label className={LABEL}>Year</label><Input value={form.year} onChange={e => setForm(p => ({ ...p, year: e.target.value }))} className={FINPUT} placeholder="2026" /></div>
                <div><label className={LABEL}>Color</label><Input value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} className={FINPUT} placeholder="Black" /></div>
                <div><label className={LABEL}>Plate</label><Input value={form.regPlate} onChange={e => setForm(p => ({ ...p, regPlate: e.target.value }))} className={FINPUT} placeholder="ABC-1234" /></div>
                <div><label className={LABEL}>Passenger Cap.</label><Input type="number" min="1" max="14" value={form.passengerCapacity} onChange={e => setForm(p => ({ ...p, passengerCapacity: e.target.value }))} className={FINPUT} placeholder="3" /></div>
              </div>
              <div><label className={LABEL}>Vehicle Class</label>
                <select value={form.vehicleClass} onChange={e => setForm(p => ({ ...p, vehicleClass: e.target.value }))} className="bg-white/5 border border-white/10 text-white rounded-none h-10 text-sm px-3 w-full">
                  <option value="business">Business Class Sedan</option>
                  <option value="suv">Premium SUV</option>
                </select>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.hasCarSeat} onChange={e => setForm(p => ({ ...p, hasCarSeat: e.target.checked }))} className="rounded" />
                <span className="text-sm text-gray-300">Car seat available</span>
              </label>
            </div>
            <div className="px-7 py-5 border-t border-border flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowAdd(false)} className="rounded-none border-white/20 text-white hover:bg-white/10 text-xs uppercase tracking-widest">Cancel</Button>
              <Button onClick={handleAdd} disabled={saving} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-6">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Add Vehicle"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}

export default function DriverVehicles() {
  return <AuthGuard requiredRole="driver"><VehiclesInner /></AuthGuard>;
}
