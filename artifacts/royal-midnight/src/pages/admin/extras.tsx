import { useState, useEffect, useCallback, Fragment } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import {
  LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag,
  MessageSquare, BarChart, Settings, Wallet, Gift, Building2,
  Plus, Trash2, Pencil, X, Loader2, ChevronDown, ChevronRight,
} from "lucide-react";
import { API_BASE } from "@/lib/constants";
import { assertOk } from "@/lib/assertOk";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminNavItems } from "@/config/portalNav";


const LABEL = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const FINPUT = "bg-white/5 border-white/10 text-white rounded-none h-10 text-sm";

// ── Types ─────────────────────────────────────────────────────────────────────

type AirportEntry = {
  code: string;
  name: string;
  prices: Record<string, number>;
};

type FixedRoute = {
  id: number;
  originName: string;
  originAddress: string;
  destinationCode: string;
  destinationName: string;
  vehicleClass: string;
  fixedPrice: number;
  airportsJson: AirportEntry[] | null;
  isActive: boolean;
};

type ExtraService = {
  id: number;
  name: string;
  description?: string | null;
  category: string;
  price: number;
  icon?: string | null;
  isActive: boolean;
  /** Paid to the chauffeur in full, with no commission taken. */
  paidToDriver?: boolean;
  sortOrder: number;
};

type PricingRule = {
  id: number;
  vehicleClass: string;
  name: string;
  isActive: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const AIRPORT_OPTIONS = [
  { code: "fll", name: "Fort Lauderdale–Hollywood Int'l (FLL)" },
  { code: "mia", name: "Miami International Airport (MIA)" },
  { code: "pbi", name: "Palm Beach International (PBI)" },
  { code: "opa", name: "Opa-locka Executive Airport (OPA)" },
  { code: "mco", name: "Orlando International Airport (MCO)" },
  { code: "tpa", name: "Tampa International Airport (TPA)" },
  { code: "jax", name: "Jacksonville International Airport (JAX)" },
  { code: "rsw", name: "Southwest Florida Int'l – Fort Myers (RSW)" },
];

const EXTRA_CATEGORIES = ["amenity", "equipment", "pet", "event", "other"];

// ── Helpers ───────────────────────────────────────────────────────────────────

type AirportFormEntry = { code: string; prices: Record<string, string> };
type RouteFormState = { originName: string; originAddress: string; airports: AirportFormEntry[]; isActive: boolean };
type ExtraFormState = { name: string; description: string; category: string; price: string; icon: string; sortOrder: string };

const emptyAirport = (): AirportFormEntry => ({ code: "fll", prices: {} });
const emptyRoute = (): RouteFormState => ({ originName: "", originAddress: "", airports: [emptyAirport()], isActive: true });
const emptyExtra = (): ExtraFormState => ({ name: "", description: "", category: "amenity", price: "", icon: "", sortOrder: "0" });

function routeToForm(r: FixedRoute): RouteFormState {
  if (r.airportsJson?.length) {
    return {
      originName: r.originName,
      originAddress: r.originAddress,
      airports: r.airportsJson.map(a => ({
        code: a.code,
        prices: Object.fromEntries(Object.entries(a.prices).map(([k, v]) => [k, String(v)])),
      })),
      isActive: r.isActive,
    };
  }
  // Legacy single-class format
  return {
    originName: r.originName,
    originAddress: r.originAddress,
    airports: [{ code: r.destinationCode, prices: { [r.vehicleClass]: String(r.fixedPrice) } }],
    isActive: r.isActive,
  };
}

function formToPayload(form: RouteFormState): Record<string, unknown> {
  const airportsJson: AirportEntry[] = form.airports
    .filter(a => a.code && Object.keys(a.prices).length > 0)
    .map(a => ({
      code: a.code,
      name: AIRPORT_OPTIONS.find(o => o.code === a.code)?.name ?? a.code.toUpperCase(),
      prices: Object.fromEntries(
        Object.entries(a.prices)
          .filter(([, v]) => v !== "" && !isNaN(parseFloat(v)))
          .map(([k, v]) => [k, parseFloat(v)]),
      ),
    }))
    .filter(a => Object.keys(a.prices).length > 0);

  return {
    originName: form.originName.trim(),
    originAddress: form.originAddress.trim(),
    airportsJson,
    isActive: form.isActive,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminExtras() {
  const { token, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const authHdr = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  // Routes state
  const [routes, setRoutes] = useState<FixedRoute[]>([]);
  const [routeLoading, setRouteLoading] = useState(true);
  const [routeModal, setRouteModal] = useState<{ mode: "add" | "edit"; route?: FixedRoute } | null>(null);
  const [routeForm, setRouteForm] = useState<RouteFormState>(emptyRoute());
  const [routeSaving, setRouteSaving] = useState(false);
  const [routeDeleting, setRouteDeleting] = useState<number | null>(null);
  const [expandedRouteId, setExpandedRouteId] = useState<number | null>(null);

  // Extras state
  const [extras, setExtras] = useState<ExtraService[]>([]);
  const [extrasLoading, setExtrasLoading] = useState(true);
  const [extraModal, setExtraModal] = useState<{ mode: "add" | "edit"; extra?: ExtraService } | null>(null);
  const [extraForm, setExtraForm] = useState<ExtraFormState>(emptyExtra());
  const [extraSaving, setExtraSaving] = useState(false);
  const [extraDeleting, setExtraDeleting] = useState<number | null>(null);

  // Active pricing rules (for vehicle class names)
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);

  const fetchRoutes = useCallback(() => {
    if (!isAuthenticated) return;
    setRouteLoading(true);
    fetch(`${API_BASE}/admin/fixed-routes`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() as Promise<FixedRoute[]> : Promise.resolve([]))
      .then(setRoutes).catch(() => setRoutes([]))
      .finally(() => setRouteLoading(false));
  }, [token]);

  const fetchExtras = useCallback(() => {
    if (!isAuthenticated) return;
    setExtrasLoading(true);
    fetch(`${API_BASE}/admin/extras`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() as Promise<ExtraService[]> : Promise.resolve([]))
      .then(setExtras).catch(() => setExtras([]))
      .finally(() => setExtrasLoading(false));
  }, [token]);

  const fetchPricingRules = useCallback(() => {
    if (!isAuthenticated) return;
    fetch(`${API_BASE}/pricing`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() as Promise<PricingRule[]> : Promise.resolve([]))
      .then(rules => setPricingRules(rules.filter(r => r.isActive)))
      .catch(() => setPricingRules([]));
  }, [token]);

  useEffect(() => { fetchRoutes(); fetchExtras(); fetchPricingRules(); }, [fetchRoutes, fetchExtras, fetchPricingRules]);

  // ── Route modal ─────────────────────────────────────────────────────────────

  function openRouteAdd() {
    setRouteForm(emptyRoute());
    setRouteModal({ mode: "add" });
  }

  function openRouteEdit(route: FixedRoute) {
    setRouteForm(routeToForm(route));
    setRouteModal({ mode: "edit", route });
  }

  function setAirportCode(idx: number, code: string) {
    setRouteForm(prev => ({
      ...prev,
      airports: prev.airports.map((a, i) => i === idx ? { ...a, code } : a),
    }));
  }

  function setAirportPrice(idx: number, vc: string, val: string) {
    setRouteForm(prev => ({
      ...prev,
      airports: prev.airports.map((a, i) => {
        if (i !== idx) return a;
        const prices = { ...a.prices };
        if (val === "") { delete prices[vc]; } else { prices[vc] = val; }
        return { ...a, prices };
      }),
    }));
  }

  function addAirport() {
    setRouteForm(prev => ({ ...prev, airports: [...prev.airports, emptyAirport()] }));
  }

  function removeAirport(idx: number) {
    setRouteForm(prev => ({ ...prev, airports: prev.airports.filter((_, i) => i !== idx) }));
  }

  const handleSaveRoute = async () => {
    if (!routeForm.originName.trim() || !routeForm.originAddress.trim()) {
      toast({ title: "Missing fields", description: "Hotel name and address are required.", variant: "destructive" });
      return;
    }
    const payload = formToPayload(routeForm);
    const airportsJson = payload.airportsJson as AirportEntry[];
    if (!airportsJson.length) {
      toast({ title: "No prices set", description: "Add at least one airport with a price.", variant: "destructive" });
      return;
    }
    setRouteSaving(true);
    try {
      const editRoute = routeModal?.mode === "edit" ? routeModal.route : undefined;
      const isEdit = !!editRoute;
      const url = editRoute ? `${API_BASE}/admin/fixed-routes/${editRoute.id}` : `${API_BASE}/admin/fixed-routes`;
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: authHdr, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "Failed");
      toast({ title: isEdit ? "Route updated" : "Route added" });
      setRouteModal(null);
      fetchRoutes();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
    setRouteSaving(false);
  };

  const handleDeleteRoute = async (id: number) => {
    setRouteDeleting(id);
    try {
      await assertOk(
        await fetch(`${API_BASE}/admin/fixed-routes/${id}`, { method: "DELETE", headers: authHdr }),
        "Could not delete the route",
      );
      toast({ title: "Route deleted" });
      fetchRoutes();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setRouteDeleting(null);
    }
  };

  const handleToggleRoute = async (r: FixedRoute) => {
    try {
      await assertOk(
        await fetch(`${API_BASE}/admin/fixed-routes/${r.id}`, {
          method: "PATCH", headers: authHdr,
          body: JSON.stringify({ isActive: !r.isActive }),
        }),
        "Could not change the route status",
      );
      fetchRoutes();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  };

  // ── Extra modal ─────────────────────────────────────────────────────────────

  function openExtraAdd() {
    setExtraForm(emptyExtra());
    setExtraModal({ mode: "add" });
  }

  function openExtraEdit(e: ExtraService) {
    setExtraForm({ name: e.name, description: e.description ?? "", category: e.category, price: String(e.price), icon: e.icon ?? "", sortOrder: String(e.sortOrder) });
    setExtraModal({ mode: "edit", extra: e });
  }

  const handleSaveExtra = async () => {
    if (!extraForm.name || !extraForm.price) {
      toast({ title: "Missing fields", description: "Name and price are required.", variant: "destructive" });
      return;
    }
    setExtraSaving(true);
    try {
      const editExtra = extraModal?.mode === "edit" ? extraModal.extra : undefined;
      const isEdit = !!editExtra;
      const url = editExtra ? `${API_BASE}/admin/extras/${editExtra.id}` : `${API_BASE}/admin/extras`;
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method, headers: authHdr,
        body: JSON.stringify({ ...extraForm, price: parseFloat(extraForm.price), sortOrder: parseInt(extraForm.sortOrder) || 0 }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "Failed");
      toast({ title: isEdit ? "Extra updated" : "Extra added" });
      setExtraModal(null);
      fetchExtras();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
    setExtraSaving(false);
  };

  const handleDeleteExtra = async (id: number) => {
    setExtraDeleting(id);
    try {
      await assertOk(
        await fetch(`${API_BASE}/admin/extras/${id}`, { method: "DELETE", headers: authHdr }),
        "Could not delete the add-on",
      );
      toast({ title: "Add-on deleted" });
      fetchExtras();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setExtraDeleting(null);
    }
  };

  const handleToggleExtra = async (e: ExtraService) => {
    try {
      await assertOk(
        await fetch(`${API_BASE}/admin/extras/${e.id}`, {
          method: "PATCH", headers: authHdr,
          body: JSON.stringify({ isActive: !e.isActive }),
        }),
        "Could not change the add-on status",
      );
      fetchExtras();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    }
  };

  /** Who keeps this add-on's price. Surfaces the server's error rather than
   *  letting the toggle silently snap back — a 503 here means migration 0011
   *  has not been applied yet. */
  const handleTogglePayout = async (e: ExtraService) => {
    const res = await fetch(`${API_BASE}/admin/extras/${e.id}`, {
      method: "PATCH", headers: authHdr,
      body: JSON.stringify({ paidToDriver: !e.paidToDriver }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      toast({ title: "Could not change who is paid", description: body?.error, variant: "destructive" });
      return;
    }
    fetchExtras();
  };

  // ── Helpers for route display ────────────────────────────────────────────────

  function getRouteAirportsSummary(r: FixedRoute): string {
    if (r.airportsJson?.length) {
      return r.airportsJson.map(a => a.code.toUpperCase()).join(", ");
    }
    return r.destinationCode.toUpperCase();
  }

  function getRoutePricesSummary(r: FixedRoute): string {
    if (r.airportsJson?.length) {
      const allPrices: number[] = r.airportsJson.flatMap(a => Object.values(a.prices));
      if (!allPrices.length) return "—";
      const min = Math.min(...allPrices);
      const max = Math.max(...allPrices);
      return min === max ? `$${min.toFixed(0)}` : `$${min.toFixed(0)} – $${max.toFixed(0)}`;
    }
    return `$${r.fixedPrice.toFixed(2)}`;
  }

  function getClassName(vc: string): string {
    return pricingRules.find(r => r.vehicleClass === vc)?.name ?? vc;
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <h1 className="font-serif text-2xl sm:text-3xl mb-8">Extras & Fixed Routes</h1>

      {/* ── Fixed Routes ──────────────────────────────────────────────────────── */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-serif text-xl">Fixed Hotel → Airport Prices</h2>
            <p className="text-xs text-muted-foreground mt-1">
              When a booking matches this hotel + airport, the quote shows the flat rate — no mileage, no airport fee. Only tax and CC fee are added on top.
            </p>
          </div>
          <Button onClick={openRouteAdd} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-5">
            <Plus className="w-4 h-4 mr-2" />Add Route
          </Button>
        </div>

        <div className="bg-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-background/50 border-b border-border">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground w-6" />
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Origin Hotel / Address</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Airports</th>
                <th className="px-5 py-3 text-right font-medium text-muted-foreground hidden sm:table-cell">Price Range</th>
                <th className="px-5 py-3 text-center font-medium text-muted-foreground">Active</th>
                <th className="px-5 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {routeLoading ? (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading...</td></tr>
              ) : !routes.length ? (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">No fixed routes yet. Add hotels above.</td></tr>
              ) : routes.map(r => (
                <Fragment key={r.id}>
                  <tr className={`hover:bg-background/50 transition-colors ${!r.isActive ? "opacity-50" : ""}`}>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => setExpandedRouteId(expandedRouteId === r.id ? null : r.id)}
                        className="text-muted-foreground hover:text-white transition-colors"
                      >
                        {expandedRouteId === r.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium">{r.originName}</div>
                      <div className="text-xs text-muted-foreground">{r.originAddress}</div>
                      {!r.airportsJson && <span className="text-[10px] text-amber-500 uppercase tracking-widest">Legacy</span>}
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell text-muted-foreground text-sm">
                      {getRouteAirportsSummary(r)}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-primary hidden sm:table-cell">
                      {getRoutePricesSummary(r)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => handleToggleRoute(r)} className={`text-xs px-2 py-0.5 border rounded-full ${r.isActive ? "border-green-500/30 text-green-400 hover:bg-green-500/10" : "border-white/20 text-muted-foreground hover:bg-white/5"}`}>
                        {r.isActive ? "On" : "Off"}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openRouteEdit(r)} className="text-muted-foreground hover:text-primary transition-colors p-1" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteRoute(r.id)} disabled={routeDeleting === r.id} className="text-red-400/60 hover:text-red-400 transition-colors p-1">
                          {routeDeleting === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedRouteId === r.id && (
                    <tr className="bg-background/30">
                      <td />
                      <td colSpan={5} className="px-5 py-4">
                        {r.airportsJson?.length ? (
                          <div className="space-y-4">
                            {r.airportsJson.map(apt => (
                              <div key={apt.code}>
                                <p className="text-xs uppercase tracking-widest text-primary mb-2">{apt.name ?? apt.code.toUpperCase()}</p>
                                <div className="flex flex-wrap gap-3">
                                  {Object.entries(apt.prices).map(([vc, price]) => (
                                    <div key={vc} className="px-3 py-1.5 bg-white/5 border border-border text-xs">
                                      <span className="text-muted-foreground">{getClassName(vc)}</span>
                                      <span className="text-white font-medium ml-2">${Number(price).toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            {r.destinationName} · {getClassName(r.vehicleClass)} · ${r.fixedPrice.toFixed(2)}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Paid Extras ───────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-serif text-xl">Paid Add-ons</h2>
            <p className="text-xs text-muted-foreground mt-1">Passengers can select these extras when booking. The cost is added to the total.</p>
          </div>
          <Button onClick={openExtraAdd} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-5">
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
                <th className="px-5 py-3 text-center font-medium text-muted-foreground">Paid To</th>
                <th className="px-5 py-3 text-center font-medium text-muted-foreground">Active</th>
                <th className="px-5 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {extrasLoading ? (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading...</td></tr>
              ) : !extras.length ? (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">No extras yet. Add champagne, car seats, etc.</td></tr>
              ) : extras.map(e => (
                <tr key={e.id} className={`hover:bg-background/50 ${!e.isActive ? "opacity-50" : ""}`}>
                  <td className="px-5 py-3">
                    <div className="font-medium">{e.icon && <span className="mr-2">{e.icon}</span>}{e.name}</div>
                    {e.description && <div className="text-xs text-muted-foreground">{e.description}</div>}
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell capitalize text-muted-foreground">{e.category}</td>
                  <td className="px-5 py-3 text-right font-medium text-primary">+${e.price.toFixed(2)}</td>
                  <td className="px-5 py-3 text-center">
                    <button
                      onClick={() => handleTogglePayout(e)}
                      title="Add-ons the chauffeur personally provides are paid to them in full, with no commission taken."
                      className={`text-xs px-2 py-0.5 border rounded-full ${e.paidToDriver ? "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10" : "border-white/20 text-muted-foreground hover:bg-white/5"}`}
                    >
                      {e.paidToDriver ? "Chauffeur" : "Company"}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button onClick={() => handleToggleExtra(e)} className={`text-xs px-2 py-0.5 border rounded-full ${e.isActive ? "border-green-500/30 text-green-400 hover:bg-green-500/10" : "border-white/20 text-muted-foreground hover:bg-white/5"}`}>
                      {e.isActive ? "On" : "Off"}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openExtraEdit(e)} className="text-muted-foreground hover:text-primary transition-colors p-1" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteExtra(e.id)} disabled={extraDeleting === e.id} className="text-red-400/60 hover:text-red-400 transition-colors p-1">
                        {extraDeleting === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Add/Edit Route Modal ─────────────────────────────────────────────── */}
      {routeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto" onClick={() => setRouteModal(null)}>
          <div className="bg-card border border-border w-full max-w-2xl my-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-7 py-5 border-b border-border">
              <h2 className="font-serif text-xl">{routeModal.mode === "add" ? "Add Fixed Route" : "Edit Route"}</h2>
              <button onClick={() => setRouteModal(null)} className="text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-7 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Origin */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Hotel / Origin Name *</label>
                  <Input value={routeForm.originName} onChange={e => setRouteForm(p => ({ ...p, originName: e.target.value }))} className={FINPUT} placeholder="1 Hotel South Beach" />
                </div>
                <div>
                  <label className={LABEL}>Full Address *</label>
                  <Input value={routeForm.originAddress} onChange={e => setRouteForm(p => ({ ...p, originAddress: e.target.value }))} className={FINPUT} placeholder="2341 Collins Ave, Miami Beach, FL" />
                </div>
              </div>

              <p className="text-xs text-muted-foreground -mt-2">
                The address should match what passengers type when booking — the system does fuzzy matching on hotel name and street address.
              </p>

              {/* Airports */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className={LABEL + " mb-0"}>Airports & Prices</label>
                  <button onClick={addAirport} className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Airport
                  </button>
                </div>

                <div className="space-y-5">
                  {routeForm.airports.map((apt, idx) => (
                    <div key={idx} className="border border-border p-4 space-y-3 bg-background/30">
                      <div className="flex items-center justify-between">
                        <select
                          value={apt.code}
                          onChange={e => setAirportCode(idx, e.target.value)}
                          className="bg-white/5 border border-white/10 text-white rounded-none h-9 text-sm px-3 flex-1 mr-3"
                        >
                          {AIRPORT_OPTIONS.map(a => <option key={a.code} value={a.code} className="bg-zinc-900">{a.name}</option>)}
                        </select>
                        {routeForm.airports.length > 1 && (
                          <button onClick={() => removeAirport(idx)} className="text-red-400/60 hover:text-red-400 transition-colors p-1 flex-shrink-0">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Price grid per vehicle class */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {pricingRules.length === 0 ? (
                          <p className="text-xs text-muted-foreground col-span-2">Loading vehicle classes...</p>
                        ) : pricingRules.map(rule => (
                          <div key={rule.vehicleClass} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-32 flex-shrink-0">{rule.name}</span>
                            <div className="relative flex-1">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={apt.prices[rule.vehicleClass] ?? ""}
                                onChange={e => setAirportPrice(idx, rule.vehicleClass, e.target.value)}
                                className="bg-white/5 border-white/10 text-white rounded-none h-9 text-sm pl-6"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">Leave blank to skip a class — that vehicle won't receive a flat rate for this airport.</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setRouteForm(p => ({ ...p, isActive: !p.isActive }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${routeForm.isActive ? "bg-primary" : "bg-white/10"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${routeForm.isActive ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
                <span className="text-sm text-muted-foreground">{routeForm.isActive ? "Active — route will be applied during booking" : "Inactive — route won't apply"}</span>
              </div>
            </div>

            <div className="px-7 py-5 border-t border-border flex justify-end gap-3">
              <Button variant="outline" onClick={() => setRouteModal(null)} className="rounded-none border-white/20 text-white hover:bg-white/10 text-xs uppercase tracking-widest">Cancel</Button>
              <Button onClick={() => void handleSaveRoute()} disabled={routeSaving} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-6">
                {routeSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : routeModal.mode === "add" ? "Add Route" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit Extra Modal ─────────────────────────────────────────────── */}
      {extraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setExtraModal(null)}>
          <div className="bg-card border border-border w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-7 py-5 border-b border-border">
              <h2 className="font-serif text-xl">{extraModal.mode === "add" ? "Add Paid Extra" : "Edit Extra"}</h2>
              <button onClick={() => setExtraModal(null)} className="text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-7 space-y-4">
              <div><label className={LABEL}>Name *</label><Input value={extraForm.name} onChange={e => setExtraForm(p => ({ ...p, name: e.target.value }))} className={FINPUT} placeholder="Champagne Service" /></div>
              <div><label className={LABEL}>Description</label><Input value={extraForm.description} onChange={e => setExtraForm(p => ({ ...p, description: e.target.value }))} className={FINPUT} placeholder="Moët & Chandon, chilled and ready" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={LABEL}>Category</label>
                  <select value={extraForm.category} onChange={e => setExtraForm(p => ({ ...p, category: e.target.value }))} className="bg-white/5 border border-white/10 text-white rounded-none h-10 text-sm px-3 w-full">
                    {EXTRA_CATEGORIES.map(c => <option key={c} value={c} className="capitalize bg-zinc-900">{c}</option>)}
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
              <Button variant="outline" onClick={() => setExtraModal(null)} className="rounded-none border-white/20 text-white hover:bg-white/10 text-xs uppercase tracking-widest">Cancel</Button>
              <Button onClick={() => void handleSaveExtra()} disabled={extraSaving} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-6">
                {extraSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : extraModal.mode === "add" ? "Add Extra" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
