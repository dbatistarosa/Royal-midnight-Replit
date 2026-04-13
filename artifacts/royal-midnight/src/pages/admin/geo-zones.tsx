import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import {
  LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag,
  MessageSquare, BarChart, Settings, Wallet, MapPin, Plus, Pencil,
  Trash2, X, ToggleLeft, ToggleRight, Loader2,
} from "lucide-react";
import { API_BASE } from "@/lib/constants";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";

const adminNavItems = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Bookings", href: "/admin/bookings", icon: Calendar },
  { label: "Dispatch", href: "/admin/dispatch", icon: Map },
  { label: "Passengers", href: "/admin/passengers", icon: Users },
  { label: "Drivers", href: "/admin/drivers", icon: Users },
  { label: "Fleet", href: "/admin/fleet", icon: Car },
  { label: "Pricing", href: "/admin/pricing", icon: DollarSign },
  { label: "Geo Zones", href: "/admin/geo-zones", icon: MapPin },
  { label: "Promos", href: "/admin/promos", icon: Tag },
  { label: "Support", href: "/admin/support", icon: MessageSquare },
  { label: "Reports", href: "/admin/reports", icon: BarChart },
  { label: "Payouts", href: "/admin/payouts", icon: Wallet },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

type CircleGeometry = { center: [number, number]; radiusKm: number };
type PolygonGeometry = { coordinates: [number, number][] };

type GeoZone = {
  id: number;
  name: string;
  description: string | null;
  type: "circle" | "polygon";
  geometry: CircleGeometry | PolygonGeometry;
  rateMultiplier: number;
  isActive: boolean;
  createdAt: string;
};

const LABEL = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const INPUT = "w-full bg-white/5 border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder:text-gray-600 rounded-none";

const PRESET_ZONES: Array<{ name: string; description: string; geometry: CircleGeometry }> = [
  { name: "Florida Keys", description: "Monroe County — Keys surcharge zone", geometry: { center: [24.8, -81.2], radiusKm: 80 } },
  { name: "Orlando Metro", description: "Orange County area", geometry: { center: [28.54, -81.38], radiusKm: 40 } },
  { name: "Tampa Bay", description: "Hillsborough & Pinellas counties", geometry: { center: [27.98, -82.53], radiusKm: 40 } },
  { name: "Jacksonville", description: "Duval County area", geometry: { center: [30.33, -81.66], radiusKm: 35 } },
  { name: "Panhandle", description: "Northwest Florida corridor", geometry: { center: [30.4, -86.0], radiusKm: 120 } },
];

function MultiplierBadge({ value }: { value: number }) {
  const pct = Math.round((value - 1) * 100);
  const color = value > 1 ? "text-amber-400 bg-amber-400/10 border-amber-400/30" : value < 1 ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" : "text-gray-400 bg-white/5 border-white/10";
  const label = value > 1 ? `+${pct}%` : value < 1 ? `${pct}%` : "Standard";
  return (
    <span className={`inline-block px-2 py-0.5 text-xs border font-medium ${color}`}>{label}</span>
  );
}

function ZoneModal({
  onClose,
  onSaved,
  token,
}: {
  onClose: () => void;
  onSaved: (zone: GeoZone) => void;
  token: string;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"circle" | "polygon">("circle");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radiusKm, setRadiusKm] = useState("25");
  const [polygonInput, setPolygonInput] = useState("");
  const [multiplier, setMultiplier] = useState("1.25");
  const [saving, setSaving] = useState(false);
  const [usePreset, setUsePreset] = useState(false);

  const applyPreset = (preset: typeof PRESET_ZONES[0]) => {
    setName(preset.name);
    setDescription(preset.description);
    setType("circle");
    setLat(String(preset.geometry.center[0]));
    setLng(String(preset.geometry.center[1]));
    setRadiusKm(String(preset.geometry.radiusKm));
    setUsePreset(false);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    let geometry: CircleGeometry | PolygonGeometry;
    if (type === "circle") {
      const latN = parseFloat(lat), lngN = parseFloat(lng), radN = parseFloat(radiusKm);
      if (isNaN(latN) || isNaN(lngN) || isNaN(radN) || radN <= 0) {
        toast({ title: "Invalid circle parameters", variant: "destructive" }); return;
      }
      geometry = { center: [latN, lngN], radiusKm: radN };
    } else {
      try {
        const coords = polygonInput.trim().split("\n").map(line => {
          const [lngS, latS] = line.trim().split(",");
          return [parseFloat(lngS!), parseFloat(latS!)] as [number, number];
        });
        if (coords.some(([a, b]) => isNaN(a) || isNaN(b))) throw new Error("bad coords");
        geometry = { coordinates: coords };
      } catch {
        toast({ title: "Invalid polygon coordinates. Enter one 'lng,lat' per line.", variant: "destructive" }); return;
      }
    }
    const multN = parseFloat(multiplier);
    if (isNaN(multN) || multN <= 0) { toast({ title: "Invalid rate multiplier", variant: "destructive" }); return; }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/geo-zones`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, type, geometry, rateMultiplier: multN }),
      });
      if (!res.ok) throw new Error("Failed");
      const zone = await res.json() as GeoZone;
      onSaved(zone);
      toast({ title: "Zone created" });
      onClose();
    } catch {
      toast({ title: "Error saving zone", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0a0a0a] border border-white/12 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <h2 className="font-serif text-lg">New Pricing Zone</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-500 hover:text-white" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Preset quick-fill */}
          <div>
            <button
              type="button"
              onClick={() => setUsePreset(p => !p)}
              className="text-xs text-primary border border-primary/30 px-3 py-1.5 hover:bg-primary/10"
            >
              Use Region Preset
            </button>
            {usePreset && (
              <div className="mt-2 border border-white/10 divide-y divide-white/5">
                {PRESET_ZONES.map(p => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="w-full text-left px-3 py-2 hover:bg-white/5 text-sm"
                  >
                    <span className="text-white">{p.name}</span>
                    <span className="text-gray-500 ml-2 text-xs">{p.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className={LABEL}>Zone Name</label>
            <input className={INPUT} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Florida Keys" />
          </div>

          <div>
            <label className={LABEL}>Description <span className="normal-case text-gray-600 tracking-normal font-normal ml-1">optional</span></label>
            <input className={INPUT} value={description} onChange={e => setDescription(e.target.value)} placeholder="Internal note for this zone" />
          </div>

          <div>
            <label className={LABEL}>Zone Type</label>
            <div className="flex gap-2">
              {(["circle", "polygon"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-4 py-2 text-xs uppercase tracking-widest border transition-colors ${type === t ? "bg-primary text-black border-primary font-semibold" : "border-white/15 text-gray-400 hover:text-white"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {type === "circle" ? (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={LABEL}>Latitude</label>
                <input className={INPUT} value={lat} onChange={e => setLat(e.target.value)} placeholder="25.79" />
              </div>
              <div>
                <label className={LABEL}>Longitude</label>
                <input className={INPUT} value={lng} onChange={e => setLng(e.target.value)} placeholder="-80.13" />
              </div>
              <div>
                <label className={LABEL}>Radius (km)</label>
                <input className={INPUT} value={radiusKm} onChange={e => setRadiusKm(e.target.value)} placeholder="25" />
              </div>
            </div>
          ) : (
            <div>
              <label className={LABEL}>Polygon Coordinates <span className="normal-case text-gray-600 tracking-normal font-normal">— one lng,lat per line (close by repeating first point)</span></label>
              <textarea
                className={`${INPUT} font-mono h-32 resize-none`}
                value={polygonInput}
                onChange={e => setPolygonInput(e.target.value)}
                placeholder={"-80.13,25.79\n-80.20,25.79\n-80.20,25.85\n-80.13,25.85\n-80.13,25.79"}
              />
            </div>
          )}

          <div>
            <label className={LABEL}>Rate Multiplier <span className="normal-case text-gray-600 tracking-normal font-normal ml-1">— 1.25 = 25% surcharge · 0.90 = 10% discount</span></label>
            <input className={INPUT} value={multiplier} onChange={e => setMultiplier(e.target.value)} placeholder="1.25" />
            <p className="text-xs text-gray-600 mt-1">
              Preview: {(() => {
                const n = parseFloat(multiplier);
                if (isNaN(n)) return "—";
                const pct = Math.round((n - 1) * 100);
                return pct === 0 ? "No change" : pct > 0 ? `+${pct}% fare surcharge` : `${pct}% fare discount`;
              })()}
            </p>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-black text-xs uppercase tracking-widest font-semibold hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? "Saving..." : "Create Zone"}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 border border-white/15 text-xs uppercase tracking-widest text-gray-400 hover:text-white">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminGeoZones() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [zones, setZones] = useState<GeoZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/geo-zones`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) setZones(await res.json() as GeoZone[]);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggleActive = async (zone: GeoZone) => {
    setToggling(zone.id);
    try {
      const res = await fetch(`${API_BASE}/admin/geo-zones/${zone.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ isActive: !zone.isActive }),
      });
      if (res.ok) {
        const updated = await res.json() as GeoZone;
        setZones(prev => prev.map(z => z.id === zone.id ? updated : z));
        toast({ title: updated.isActive ? "Zone activated" : "Zone deactivated" });
      }
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setToggling(null);
    }
  };

  const deleteZone = async (id: number) => {
    if (!confirm("Delete this pricing zone?")) return;
    setDeleting(id);
    try {
      await fetch(`${API_BASE}/admin/geo-zones/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      setZones(prev => prev.filter(z => z.id !== id));
      toast({ title: "Zone deleted" });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const formatGeometry = (zone: GeoZone): string => {
    if (zone.type === "circle") {
      const g = zone.geometry as CircleGeometry;
      return `Circle · ${g.center[0].toFixed(3)}°, ${g.center[1].toFixed(3)}° · r=${g.radiusKm} km`;
    }
    const g = zone.geometry as PolygonGeometry;
    return `Polygon · ${g.coordinates.length} vertices`;
  };

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl mb-1">Geo Pricing Zones</h1>
          <p className="text-sm text-muted-foreground">
            Draw zones on the map — when a route passes through a zone the quote engine applies the rate multiplier automatically.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-black text-xs uppercase tracking-widest font-semibold hover:bg-primary/90 shrink-0 ml-4"
        >
          <Plus className="w-4 h-4" /> New Zone
        </button>
      </div>

      {/* How it works */}
      <div className="bg-primary/5 border border-primary/20 p-4 mb-6 text-xs text-gray-400 leading-relaxed">
        <strong className="text-primary uppercase tracking-widest text-[10px]">How it works</strong>
        <p className="mt-1.5">
          When a passenger gets a quote, the system geocodes the pickup, drop-off, and all waypoints.
          If any point falls inside an active zone the highest matching multiplier is applied to the fare.
          Use multipliers above 1.0 for surcharge zones (e.g. Florida Keys &rarr; 1.40) and below 1.0 for discount zones.
        </p>
      </div>

      <div className="bg-card border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 px-6 py-8 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading zones...
          </div>
        ) : zones.length === 0 ? (
          <div className="px-6 py-10 text-center text-muted-foreground">
            <MapPin className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p>No pricing zones yet.</p>
            <p className="text-xs mt-1">Create your first zone to start applying geographic rate modifiers.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[700px]">
              <thead className="bg-background/50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium text-muted-foreground">Zone</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground">Type</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground">Geometry</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground">Modifier</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground">Status</th>
                  <th className="px-6 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {zones.map(zone => (
                  <tr key={zone.id} className="hover:bg-background/50">
                    <td className="px-6 py-4">
                      <div className="font-medium">{zone.name}</div>
                      {zone.description && <div className="text-xs text-muted-foreground mt-0.5">{zone.description}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs uppercase tracking-widest text-gray-500 border border-white/10 px-2 py-0.5">{zone.type}</span>
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground font-mono">{formatGeometry(zone)}</td>
                    <td className="px-6 py-4"><MultiplierBadge value={zone.rateMultiplier} /></td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleActive(zone)}
                        disabled={toggling === zone.id}
                        className="flex items-center gap-1.5 text-xs"
                      >
                        {toggling === zone.id
                          ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                          : zone.isActive
                            ? <ToggleRight className="w-5 h-5 text-primary" />
                            : <ToggleLeft className="w-5 h-5 text-gray-600" />}
                        <span className={zone.isActive ? "text-primary" : "text-gray-600"}>
                          {zone.isActive ? "Active" : "Inactive"}
                        </span>
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => deleteZone(zone.id)}
                        disabled={deleting === zone.id}
                        className="text-gray-600 hover:text-red-400 transition-colors p-1"
                      >
                        {deleting === zone.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <ZoneModal
          token={token ?? ""}
          onClose={() => setShowModal(false)}
          onSaved={zone => setZones(prev => [...prev, zone])}
        />
      )}
    </PortalLayout>
  );
}
