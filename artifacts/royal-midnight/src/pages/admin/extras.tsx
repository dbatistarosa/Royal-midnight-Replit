import { useState, useEffect, useCallback } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings, Wallet, Gift, Building2, Plus, Trash2, Pencil, X, Loader2 } from "lucide-react";
import { API_BASE } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const adminNavItems = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Bookings", href: "/admin/bookings", icon: Calendar },
  { label: "Dispatch", href: "/admin/dispatch", icon: Map },
  { label: "Passengers", href: "/admin/passengers", icon: Users },
  { label: "Drivers", href: "/admin/drivers", icon: Users },
  { label: "Fleet", href: "/admin/fleet", icon: Car },
  { label: "Pricing", href: "/admin/pricing", icon: DollarSign },
  { label: "Extras & Routes", href: "/admin/extras", icon: Tag },
  { label: "Promos", href: "/admin/promos", icon: Tag },
  { label: "Affiliates", href: "/admin/affiliates", icon: Gift },
  { label: "Corporate Accounts", href: "/admin/corporate-accounts", icon: Building2 },
  { label: "Support", href: "/admin/support", icon: MessageSquare },
  { label: "Reports", href: "/admin/reports", icon: BarChart },
  { label: "Payouts", href: "/admin/payouts", icon: Wallet },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

const LABEL = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const FINPUT = "bg-white/5 border-white/10 text-white rounded-none h-10 text-sm";

type FixedRoute = {
  id: number; originName: string; originAddress: string;
  destinationCode: string; destinationName: string; vehicleClass: string;
  fixedPrice: number; isActive: boolean;
};

type ExtraService = {
  id: number; name: string; description?: string | null; category: string;
  price: number; icon?: string | null; isActive: boolean; sortOrder: number;
};

const AIRPORT_OPTIONS = [
  { code: "fll", name: "Fort Lauderdale–Hollywood Int'l (FLL)" },
  { code: "mia", name: "Miami International Airport (MIA)" },
  { code: "pbi", name: "Palm Beach International (PBI)" },
  { code: "opa", name: "Opa-locka Executive Airport (OPA)" },
];

const EXTRA_CATEGORIES = ["amenity", "equipment", "pet", "event", "other"];

export default function AdminExtras() {
  const { token } = useAuth();
  const { toast } = useToast();
  const authHdr = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  // Fixed routes
  const [routes, setRoutes] = useState<FixedRoute[]>([]);
  const [routeLoading, setRouteLoading] = useState(true);
  const [showAddRoute, setShowAddRoute] = useState(false);
  const [routeForm, setRouteForm] = useState({ originName: "", originAddress: "", destinationCode: "fll", vehicleClass: "business", fixedPrice: "" });
  const [routeSaving, setRouteSaving] = useState(false);
  const [routeDeleting, setRouteDeleting] = useState<number | null>(null);

  // Extra services
  const [extras, setExtras] = useState<ExtraService[]>([]);
  const [extrasLoading, setExtrasLoading] = useState(true);
  const [showAddExtra, setShowAddExtra] = useState(false);
  const [extraForm, setExtraForm] = useState({ name: "", description: "", category: "amenity", price: "", icon: "", sortOrder: "0" });
  const [extraSaving, setExtraSaving] = useState(false);
  const [extraDeleting, setExtraDeleting] = useState<number | null>(null);

  const fetchRoutes = useCallback(() => {
    if (!token) return;
    setRouteLoading(true);
    fetch(`${API_BASE}/admin/fixed-routes`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() as Promise<FixedRoute[]> : Promise.resolve([]))
      .then(setRoutes).catch(() => setRoutes([]))
      .finally(() => setRouteLoading(false));
  }, [token]);

  const fetchExtras = useCallback(() => {
    if (!token) return;
    setExtrasLoading(true);
    fetch(`${API_BASE}/admin/extras`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() as Promise<ExtraService[]> : Promise.resolve([]))
      .then(setExtras).catch(() => setExtras([]))
      .finally(() => setExtrasLoading(false));
  }, [token]);

  useEffect(() => { fetchRoutes(); fetchExtras(); }, [fetchRoutes, fetchExtras]);

  const handleAddRoute = async () => {
    if (!routeForm.originName || !routeForm.originAddress || !routeForm.fixedPrice) {
      toast({ title: "Missing fields", description: "Origin name, address, and price are required.", variant: "destructive" }); return;
    }
    setRouteSaving(true);
    try {
      const airport = AIRPORT_OPTIONS.find(a => a.code === routeForm.destinationCode);
      const res = await fetch(`${API_BASE}/admin/fixed-routes`, {
        method: "POST", headers: authHdr,
        body: JSON.stringify({ ...routeForm, destinationName: airport?.name ?? routeForm.destinationCode, fixedPrice: parseFloat(routeForm.fixedPrice) }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "Failed");
      toast({ title: "Route added" });
      setShowAddRoute(false);
      setRouteForm({ originName: "", originAddress: "", destinationCode: "fll", vehicleClass: "business", fixedPrice: "" });
      fetchRoutes();
    } catch (e: unknown) { toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" }); }
    setRouteSaving(false);
  };

  const handleDeleteRoute = async (id: number) => {
    setRouteDeleting(id);
    await fetch(`${API_BASE}/admin/fixed-routes/${id}`, { method: "DELETE", headers: authHdr });
    fetchRoutes(); setRouteDeleting(null);
  };

  const handleToggleRoute = async (r: FixedRoute) => {
    await fetch(`${API_BASE}/admin/fixed-routes/${r.id}`, { method: "PATCH", headers: authHdr, body: JSON.stringify({ isActive: !r.isActive }) });
    fetchRoutes();
  };

  const handleAddExtra = async () => {
    if (!extraForm.name || !extraForm.price) {
      toast({ title: "Missing fields", description: "Name and price are required.", variant: "destructive" }); return;
    }
    setExtraSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/extras`, {
        method: "POST", headers: authHdr,
        body: JSON.stringify({ ...extraForm, price: parseFloat(extraForm.price), sortOrder: parseInt(extraForm.sortOrder) || 0 }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "Failed");
      toast({ title: "Extra added" });
      setShowAddExtra(false);
      setExtraForm({ name: "", description: "", category: "amenity", price: "", icon: "", sortOrder: "0" });
      fetchExtras();
    } catch (e: unknown) { toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" }); }
    setExtraSaving(false);
  };

  const handleDeleteExtra = async (id: number) => {
    setExtraDeleting(id);
    await fetch(`${API_BASE}/admin/extras/${id}`, { method: "DELETE", headers: authHdr });
    fetchExtras(); setExtraDeleting(null);
  };

  const handleToggleExtra = async (e: ExtraService) => {
    await fetch(`${API_BASE}/admin/extras/${e.id}`, { method: "PATCH", headers: authHdr, body: JSON.stringify({ isActive: !e.isActive }) });
    fetchExtras();
  };

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <h1 className="font-serif text-2xl sm:text-3xl mb-8">Extras & Fixed Routes</h1>

      {/* ── Fixed Routes ─────────────────────────────────────────────────────── */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-serif text-xl">Fixed Hotel → Airport Prices</h2>
            <p className="text-xs text-muted-foreground mt-1">When a booking matches this origin + airport, the quote shows this fixed price instead of the computed rate.</p>
          </div>
          <Button onClick={() => setShowAddRoute(true)} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-5">
            <Plus className="w-4 h-4 mr-2" />Add Route
          </Button>
        </div>

        <div className="bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-background/50 border-b border-border">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Origin Hotel</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Destination</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Class</th>
                <th className="px-5 py-3 text-right font-medium text-muted-foreground">Price</th>
                <th className="px-5 py-3 text-center font-medium text-muted-foreground">Active</th>
                <th className="px-5 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {routeLoading ? (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading...</td></tr>
              ) : !routes.length ? (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">No fixed routes yet. Add hotels above.</td></tr>
              ) : routes.map(r => (
                <tr key={r.id} className={`hover:bg-background/50 ${!r.isActive ? "opacity-50" : ""}`}>
                  <td className="px-5 py-3">
                    <div className="font-medium">{r.originName}</div>
                    <div className="text-xs text-muted-foreground">{r.originAddress}</div>
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell text-muted-foreground">{r.destinationName}</td>
                  <td className="px-5 py-3 hidden md:table-cell capitalize text-muted-foreground">{r.vehicleClass}</td>
                  <td className="px-5 py-3 text-right font-medium text-primary">${r.fixedPrice.toFixed(2)}</td>
                  <td className="px-5 py-3 text-center">
                    <button onClick={() => handleToggleRoute(r)} className={`text-xs px-2 py-0.5 border rounded-full ${r.isActive ? "border-green-500/30 text-green-400 hover:bg-green-500/10" : "border-white/20 text-muted-foreground hover:bg-white/5"}`}>
                      {r.isActive ? "On" : "Off"}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => handleDeleteRoute(r.id)} disabled={routeDeleting === r.id} className="text-red-400/60 hover:text-red-400 transition-colors">
                      {routeDeleting === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Paid Extras ─────────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-serif text-xl">Paid Add-ons</h2>
            <p className="text-xs text-muted-foreground mt-1">Passengers can select these extras when booking. The cost is added to the total.</p>
          </div>
          <Button onClick={() => setShowAddExtra(true)} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-5">
            <Plus className="w-4 h-4 mr-2" />Add Extra
          </Button>
        </div>

        <div className="bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-background/50 border-b border-border">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Category</th>
                <th className="px-5 py-3 text-right font-medium text-muted-foreground">Price</th>
                <th className="px-5 py-3 text-center font-medium text-muted-foreground">Active</th>
                <th className="px-5 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {extrasLoading ? (
                <tr><td colSpan={5} className="px-5 py-6 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading...</td></tr>
              ) : !extras.length ? (
                <tr><td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">No extras yet. Add champagne, car seats, etc.</td></tr>
              ) : extras.map(e => (
                <tr key={e.id} className={`hover:bg-background/50 ${!e.isActive ? "opacity-50" : ""}`}>
                  <td className="px-5 py-3">
                    <div className="font-medium">{e.icon && <span className="mr-2">{e.icon}</span>}{e.name}</div>
                    {e.description && <div className="text-xs text-muted-foreground">{e.description}</div>}
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell capitalize text-muted-foreground">{e.category}</td>
                  <td className="px-5 py-3 text-right font-medium text-primary">+${e.price.toFixed(2)}</td>
                  <td className="px-5 py-3 text-center">
                    <button onClick={() => handleToggleExtra(e)} className={`text-xs px-2 py-0.5 border rounded-full ${e.isActive ? "border-green-500/30 text-green-400 hover:bg-green-500/10" : "border-white/20 text-muted-foreground hover:bg-white/5"}`}>
                      {e.isActive ? "On" : "Off"}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => handleDeleteExtra(e.id)} disabled={extraDeleting === e.id} className="text-red-400/60 hover:text-red-400 transition-colors">
                      {extraDeleting === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add Route Modal */}
      {showAddRoute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-card border border-border w-full max-w-md">
            <div className="flex items-center justify-between px-7 py-5 border-b border-border">
              <h2 className="font-serif text-xl">Add Fixed Route</h2>
              <button onClick={() => setShowAddRoute(false)} className="text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-7 space-y-4">
              <div><label className={LABEL}>Hotel / Origin Name *</label><Input value={routeForm.originName} onChange={e => setRouteForm(p => ({ ...p, originName: e.target.value }))} className={FINPUT} placeholder="1 Hotel South Beach" /></div>
              <div><label className={LABEL}>Full Address *</label><Input value={routeForm.originAddress} onChange={e => setRouteForm(p => ({ ...p, originAddress: e.target.value }))} className={FINPUT} placeholder="2341 Collins Ave, Miami Beach, FL" /></div>
              <div><label className={LABEL}>Airport</label>
                <select value={routeForm.destinationCode} onChange={e => setRouteForm(p => ({ ...p, destinationCode: e.target.value }))} className="bg-white/5 border border-white/10 text-white rounded-none h-10 text-sm px-3 w-full">
                  {AIRPORT_OPTIONS.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
                </select>
              </div>
              <div><label className={LABEL}>Vehicle Class</label>
                <select value={routeForm.vehicleClass} onChange={e => setRouteForm(p => ({ ...p, vehicleClass: e.target.value }))} className="bg-white/5 border border-white/10 text-white rounded-none h-10 text-sm px-3 w-full">
                  <option value="business">Business Class Sedan</option>
                  <option value="suv">Premium SUV</option>
                </select>
              </div>
              <div><label className={LABEL}>Fixed Price (USD) *</label><Input type="number" min="0" step="0.01" value={routeForm.fixedPrice} onChange={e => setRouteForm(p => ({ ...p, fixedPrice: e.target.value }))} className={FINPUT} placeholder="95.00" /></div>
            </div>
            <div className="px-7 py-5 border-t border-border flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowAddRoute(false)} className="rounded-none border-white/20 text-white hover:bg-white/10 text-xs uppercase tracking-widest">Cancel</Button>
              <Button onClick={handleAddRoute} disabled={routeSaving} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-6">
                {routeSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Add Route"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Extra Modal */}
      {showAddExtra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-card border border-border w-full max-w-md">
            <div className="flex items-center justify-between px-7 py-5 border-b border-border">
              <h2 className="font-serif text-xl">Add Paid Extra</h2>
              <button onClick={() => setShowAddExtra(false)} className="text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-7 space-y-4">
              <div><label className={LABEL}>Name *</label><Input value={extraForm.name} onChange={e => setExtraForm(p => ({ ...p, name: e.target.value }))} className={FINPUT} placeholder="Champagne Service" /></div>
              <div><label className={LABEL}>Description</label><Input value={extraForm.description} onChange={e => setExtraForm(p => ({ ...p, description: e.target.value }))} className={FINPUT} placeholder="Moët & Chandon, chilled and ready" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={LABEL}>Category</label>
                  <select value={extraForm.category} onChange={e => setExtraForm(p => ({ ...p, category: e.target.value }))} className="bg-white/5 border border-white/10 text-white rounded-none h-10 text-sm px-3 w-full">
                    {EXTRA_CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                  </select>
                </div>
                <div><label className={LABEL}>Price (USD) *</label><Input type="number" min="0" step="0.01" value={extraForm.price} onChange={e => setExtraForm(p => ({ ...p, price: e.target.value }))} className={FINPUT} placeholder="45.00" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={LABEL}>Icon (emoji)</label><Input value={extraForm.icon} onChange={e => setExtraForm(p => ({ ...p, icon: e.target.value }))} className={FINPUT} placeholder="🍾" /></div>
                <div><label className={LABEL}>Sort Order</label><Input type="number" min="0" value={extraForm.sortOrder} onChange={e => setExtraForm(p => ({ ...p, sortOrder: e.target.value }))} className={FINPUT} placeholder="0" /></div>
              </div>
            </div>
            <div className="px-7 py-5 border-t border-border flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowAddExtra(false)} className="rounded-none border-white/20 text-white hover:bg-white/10 text-xs uppercase tracking-widest">Cancel</Button>
              <Button onClick={handleAddExtra} disabled={extraSaving} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-6">
                {extraSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Add Extra"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
