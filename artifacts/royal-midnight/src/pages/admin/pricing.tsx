import { useState, useEffect, useCallback } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings, Plus, Pencil, Trash2, X, Loader2, Wallet, Gift, Building2 } from "lucide-react";
import { API_BASE } from "@/lib/constants";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const adminNavItems = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Bookings", href: "/admin/bookings", icon: Calendar },
  { label: "Dispatch", href: "/admin/dispatch", icon: Map },
  { label: "Passengers", href: "/admin/passengers", icon: Users },
  { label: "Drivers", href: "/admin/drivers", icon: Users },
  { label: "Fleet", href: "/admin/fleet", icon: Car },
  { label: "Pricing", href: "/admin/pricing", icon: DollarSign },
  { label: "Promos", href: "/admin/promos", icon: Tag },
  { label: "Affiliates", href: "/admin/affiliates", icon: Gift },
  { label: "Corporate Accounts", href: "/admin/corporate-accounts", icon: Building2 },
  { label: "Support", href: "/admin/support", icon: MessageSquare },
  { label: "Reports", href: "/admin/reports", icon: BarChart },
  { label: "Payouts", href: "/admin/payouts", icon: Wallet },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

type PricingRule = {
  id: number;
  name: string;
  vehicleClass?: string | null;
  baseFare: number;
  ratePerMile: number;
  includedMiles: number;
  airportSurcharge: number;
  hourlyRate?: number | null;
  description?: string | null;
  category?: string | null;
  passengers?: number | null;
  bags?: number | null;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
};

type FormData = {
  name: string;
  vehicleClass: string;
  baseFare: string;
  ratePerMile: string;
  includedMiles: string;
  airportSurcharge: string;
  hourlyRate: string;
  description: string;
  category: string;
  passengers: string;
  bags: string;
  imageUrl: string;
  sortOrder: string;
};

const EMPTY: FormData = {
  name: "", vehicleClass: "", baseFare: "", ratePerMile: "", includedMiles: "0", airportSurcharge: "",
  hourlyRate: "", description: "", category: "", passengers: "", bags: "", imageUrl: "", sortOrder: "0",
};
const LABEL = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const INPUT = "bg-white/5 border-white/10 text-white rounded-none h-10 text-sm";

function Modal({ title, onClose, onSubmit, submitting, children }: {
  title: string; onClose: () => void; onSubmit: () => void; submitting: boolean; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-card border border-border w-full max-w-lg">
        <div className="flex items-center justify-between px-7 py-5 border-b border-border">
          <h2 className="font-serif text-xl">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
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

export default function AdminPricing() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRule, setEditRule] = useState<PricingRule | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const authHdr = token ? `Bearer ${token}` : "";

  const refetch = useCallback(() => {
    setIsLoading(true);
    fetch(`${API_BASE}/pricing`)
      .then(r => r.ok ? r.json() as Promise<PricingRule[]> : Promise.resolve([]))
      .then(data => setRules(Array.isArray(data) ? data : []))
      .catch(() => setRules([]))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const openCreate = () => { setEditRule(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (r: PricingRule) => {
    setEditRule(r);
    setForm({
      name: r.name,
      vehicleClass: r.vehicleClass ?? "",
      baseFare: String(r.baseFare),
      ratePerMile: String(r.ratePerMile),
      includedMiles: String(r.includedMiles),
      airportSurcharge: String(r.airportSurcharge),
      hourlyRate: r.hourlyRate != null ? String(r.hourlyRate) : "",
      description: r.description ?? "",
      category: r.category ?? "",
      passengers: r.passengers != null ? String(r.passengers) : "",
      bags: r.bags != null ? String(r.bags) : "",
      imageUrl: r.imageUrl ?? "",
      sortOrder: String(r.sortOrder ?? 0),
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.baseFare || !form.ratePerMile || !form.airportSurcharge) {
      toast({ title: "Missing fields", description: "All fare fields are required.", variant: "destructive" });
      return;
    }
    if (!editRule && !form.name) {
      toast({ title: "Missing fields", description: "Rule name is required.", variant: "destructive" });
      return;
    }
    if (!editRule && form.vehicleClass && !/^[a-z][a-z0-9-]*$/.test(form.vehicleClass)) {
      toast({ title: "Invalid vehicle class", description: "Use lowercase letters, numbers, and hyphens only (e.g. first-class).", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const sharedFields = {
        baseFare: parseFloat(form.baseFare),
        ratePerMile: parseFloat(form.ratePerMile),
        includedMiles: parseFloat(form.includedMiles || "0"),
        airportSurcharge: parseFloat(form.airportSurcharge),
        hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : null,
        description: form.description || null,
        category: form.category || null,
        passengers: form.passengers ? parseInt(form.passengers, 10) : null,
        bags: form.bags ? parseInt(form.bags, 10) : null,
        imageUrl: form.imageUrl || null,
        sortOrder: form.sortOrder ? parseInt(form.sortOrder, 10) : 0,
      };
      const body = editRule
        ? { ...sharedFields, name: form.name }
        : { ...sharedFields, name: form.name, vehicleClass: form.vehicleClass || null };
      const res = editRule
        ? await fetch(`${API_BASE}/pricing/${editRule.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: authHdr }, body: JSON.stringify(body) })
        : await fetch(`${API_BASE}/pricing`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: authHdr }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Failed"); }
      toast({ title: editRule ? "Rule updated" : "Rule created" });
      setModalOpen(false);
      refetch();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not save rule.", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`${API_BASE}/pricing/${id}`, { method: "DELETE", headers: { Authorization: authHdr } });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Failed"); }
      toast({ title: "Rule deleted" });
      refetch();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not delete rule.", variant: "destructive" });
    }
    setDeletingId(null);
  };

  const setField = (k: keyof FormData, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 sm:mb-8 gap-3">
        <h1 className="font-serif text-2xl sm:text-3xl">Pricing Rules</h1>
        <Button onClick={openCreate} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-5 min-h-[44px] self-start sm:self-auto">
          <Plus className="w-4 h-4 mr-2" />Add Rule
        </Button>
      </div>

      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        A rule with a Vehicle Class, Display Name, Passengers, and Image set here is automatically shown
        as a bookable vehicle class on the public Fleet, Pricing, and Booking pages — no code changes or
        deploy needed. Leave those display fields blank for a fare-only rule (e.g. a temporary surcharge).
      </p>
      <div className="bg-card border border-border rounded-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[700px]">
            <thead className="bg-background/50 border-b border-border">
              <tr>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Name</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Class</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Base Fare</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Per Mile</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Hourly</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Capacity</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Public</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Status</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading...
                </td></tr>
              ) : !rules.length ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-muted-foreground">No pricing rules found.</td></tr>
              ) : rules.map(r => {
                const isPublicClass = !!(r.vehicleClass && r.name && r.passengers != null && r.imageUrl);
                return (
                <tr key={r.id} className="hover:bg-background/50 transition-colors">
                  <td className="px-5 py-4 font-medium">{r.name}</td>
                  <td className="px-5 py-4 capitalize text-muted-foreground">{r.vehicleClass?.replace("_", " ") || "All"}</td>
                  <td className="px-5 py-4">${r.baseFare.toFixed(2)}</td>
                  <td className="px-5 py-4">${r.ratePerMile.toFixed(2)}</td>
                  <td className="px-5 py-4">{r.hourlyRate != null ? `$${r.hourlyRate.toFixed(2)}/hr` : "—"}</td>
                  <td className="px-5 py-4">{r.passengers != null ? `${r.passengers} pax / ${r.bags ?? 0} bags` : "—"}</td>
                  <td className="px-5 py-4">
                    <span className={isPublicClass ? "text-primary text-xs" : "text-muted-foreground text-xs"}>{isPublicClass ? "Yes" : "Fare only"}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={r.isActive ? "text-green-400 text-xs" : "text-muted-foreground text-xs"}>{r.isActive ? "Active" : "Inactive"}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(r)} className="text-muted-foreground hover:text-white transition-colors" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      {deletingId === r.id ? (
                        <span className="text-xs text-muted-foreground">Deleting...</span>
                      ) : (
                        <button
                          onClick={() => { if (confirm("Delete this pricing rule?")) handleDelete(r.id); }}
                          className="text-muted-foreground hover:text-red-400 transition-colors" title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <Modal title={editRule ? "Edit Pricing Rule" : "New Pricing Rule"} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} submitting={saving}>
          <div>
            <label className={LABEL}>Display Name *</label>
            <Input value={form.name} onChange={e => setField("name", e.target.value)} className={INPUT} placeholder="e.g. Business Class Sedan" />
            <p className="text-[11px] text-muted-foreground mt-1">Shown to customers on Fleet, Pricing, and Booking pages.</p>
          </div>
          {!editRule ? (
            <div>
              <label className={LABEL}>Vehicle Class (slug)</label>
              <Input value={form.vehicleClass} onChange={e => setField("vehicleClass", e.target.value.toLowerCase())} className={INPUT} placeholder="e.g. first-class" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Lowercase, hyphens only — this becomes the bookable class ID. Leave blank for a fare-only
                rule that doesn't apply to one specific class. Cannot be changed after creating.
              </p>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 px-4 py-3 text-sm text-muted-foreground">
              Vehicle class: <strong className="text-white">{editRule.vehicleClass ?? "All classes"}</strong> (cannot be changed)
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Base Fare ($) *</label>
              <Input type="number" step="0.01" value={form.baseFare} onChange={e => setField("baseFare", e.target.value)} className={INPUT} placeholder="55.00" />
            </div>
            <div>
              <label className={LABEL}>Included Miles</label>
              <Input type="number" step="0.1" value={form.includedMiles} onChange={e => setField("includedMiles", e.target.value)} className={INPUT} placeholder="0" />
            </div>
            <div>
              <label className={LABEL}>Per Mile ($) *</label>
              <Input type="number" step="0.01" value={form.ratePerMile} onChange={e => setField("ratePerMile", e.target.value)} className={INPUT} placeholder="3.50" />
              <p className="text-[11px] text-muted-foreground mt-1">Charged only on miles beyond "Included Miles".</p>
            </div>
            <div>
              <label className={LABEL}>Airport Surcharge ($) *</label>
              <Input type="number" step="0.01" value={form.airportSurcharge} onChange={e => setField("airportSurcharge", e.target.value)} className={INPUT} placeholder="10.00" />
            </div>
            <div>
              <label className={LABEL}>Hourly Rate ($/hr)</label>
              <Input type="number" step="0.01" value={form.hourlyRate} onChange={e => setField("hourlyRate", e.target.value)} className={INPUT} placeholder="95.00" />
              <p className="text-[11px] text-muted-foreground mt-1">Used for hourly charter bookings. Leave blank to use a generic estimate.</p>
            </div>
            <div>
              <label className={LABEL}>Display Order</label>
              <Input type="number" step="1" value={form.sortOrder} onChange={e => setField("sortOrder", e.target.value)} className={INPUT} placeholder="0" />
            </div>
          </div>

          <div className="border-t border-white/10 pt-5">
            <p className={LABEL}>Public Fleet Display (optional — fill in to show as a bookable class)</p>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className={LABEL}>Category</label>
                <Input value={form.category} onChange={e => setField("category", e.target.value)} className={INPUT} placeholder="e.g. Sedan, SUV" />
              </div>
              <div>
                <label className={LABEL}>Image URL</label>
                <Input value={form.imageUrl} onChange={e => setField("imageUrl", e.target.value)} className={INPUT} placeholder="/business.webp" />
              </div>
              <div>
                <label className={LABEL}>Passengers</label>
                <Input type="number" step="1" value={form.passengers} onChange={e => setField("passengers", e.target.value)} className={INPUT} placeholder="3" />
              </div>
              <div>
                <label className={LABEL}>Bags</label>
                <Input type="number" step="1" value={form.bags} onChange={e => setField("bags", e.target.value)} className={INPUT} placeholder="3" />
              </div>
            </div>
            <div className="mt-4">
              <label className={LABEL}>Description</label>
              <Textarea value={form.description} onChange={e => setField("description", e.target.value)} className="bg-white/5 border-white/10 text-white rounded-none text-sm min-h-[80px]" placeholder="Shown on the Fleet page under the vehicle name." />
            </div>
          </div>
        </Modal>
      )}
    </PortalLayout>
  );
}
