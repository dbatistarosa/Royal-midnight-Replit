import { useState, useEffect, useCallback } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings, Plus, Pencil, Trash2, X, Loader2, PowerOff } from "lucide-react";
import { format } from "date-fns";
import { API_BASE } from "@/lib/constants";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
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
  { label: "Promos", href: "/admin/promos", icon: Tag },
  { label: "Support", href: "/admin/support", icon: MessageSquare },
  { label: "Reports", href: "/admin/reports", icon: BarChart },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

type Promo = {
  id: number;
  code: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxUses?: number | null;
  usedCount: number;
  isActive: boolean;
  expiresAt?: string | null;
};

type FormData = {
  code: string;
  description: string;
  discountType: string;
  discountValue: string;
  maxUses: string;
  expiresAt: string;
};

const EMPTY: FormData = { code: "", description: "", discountType: "percentage", discountValue: "", maxUses: "", expiresAt: "" };
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

export default function AdminPromos() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editPromo, setEditPromo] = useState<Promo | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);

  const authHdr = token ? `Bearer ${token}` : "";

  const refetch = useCallback(() => {
    setIsLoading(true);
    fetch(`${API_BASE}/promos`)
      .then(r => r.ok ? r.json() as Promise<Promo[]> : Promise.resolve([]))
      .then(data => setPromos(Array.isArray(data) ? data : []))
      .catch(() => setPromos([]))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const openCreate = () => { setEditPromo(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (p: Promo) => {
    setEditPromo(p);
    setForm({
      code: p.code,
      description: p.description,
      discountType: p.discountType,
      discountValue: String(p.discountValue),
      maxUses: p.maxUses ? String(p.maxUses) : "",
      expiresAt: p.expiresAt ? p.expiresAt.slice(0, 10) : "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.code || !form.description || !form.discountValue) {
      toast({ title: "Missing fields", description: "Code, description, and discount value are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = {
        code: form.code.toUpperCase(),
        description: form.description,
        discountType: form.discountType,
        discountValue: parseFloat(form.discountValue),
        maxUses: form.maxUses ? parseInt(form.maxUses) : null,
        expiresAt: form.expiresAt || null,
      };
      const res = editPromo
        ? await fetch(`${API_BASE}/promos/${editPromo.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: authHdr }, body: JSON.stringify({ expiresAt: body.expiresAt }) })
        : await fetch(`${API_BASE}/promos`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: authHdr }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Failed"); }
      toast({ title: editPromo ? "Promo updated" : "Promo created" });
      setModalOpen(false);
      refetch();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not save promo.", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleToggle = async (p: Promo) => {
    setActionId(p.id);
    try {
      const res = await fetch(`${API_BASE}/promos/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHdr },
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: p.isActive ? "Promo deactivated" : "Promo activated" });
      refetch();
    } catch {
      toast({ title: "Error", description: "Could not update promo.", variant: "destructive" });
    }
    setActionId(null);
  };

  const handleDelete = async (id: number) => {
    setActionId(id);
    try {
      await fetch(`${API_BASE}/promos/${id}`, { method: "DELETE", headers: { Authorization: authHdr } });
      toast({ title: "Promo deleted" });
      refetch();
    } catch {
      toast({ title: "Error", description: "Could not delete promo.", variant: "destructive" });
    }
    setActionId(null);
  };

  const setField = (k: keyof FormData, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <div className="flex justify-between items-center mb-8">
        <h1 className="font-serif text-3xl">Promo Codes</h1>
        <Button onClick={openCreate} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-5 h-10">
          <Plus className="w-4 h-4 mr-2" />New Code
        </Button>
      </div>

      <div className="bg-card border border-border rounded-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-background/50 border-b border-border">
              <tr>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Code</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs hidden md:table-cell">Description</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Discount</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Uses</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs hidden md:table-cell">Expires</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Status</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading...
                </td></tr>
              ) : !promos.length ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">No promo codes found.</td></tr>
              ) : promos.map(p => (
                <tr key={p.id} className="hover:bg-background/50 transition-colors">
                  <td className="px-5 py-4 font-mono font-bold text-primary">{p.code}</td>
                  <td className="px-5 py-4 hidden md:table-cell text-muted-foreground">{p.description}</td>
                  <td className="px-5 py-4">
                    {p.discountType === "percentage" ? `${p.discountValue}%` : `$${p.discountValue}`}
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {p.usedCount}{p.maxUses ? ` / ${p.maxUses}` : ""}
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell text-muted-foreground">
                    {p.expiresAt ? format(new Date(p.expiresAt), "MMM d, yyyy") : "Never"}
                  </td>
                  <td className="px-5 py-4">
                    <span className={p.isActive ? "text-green-400 text-xs" : "text-gray-400 text-xs"}>
                      {p.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(p)} title="Edit expiry" className="text-muted-foreground hover:text-white transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggle(p)}
                        disabled={actionId === p.id}
                        title={p.isActive ? "Deactivate" : "Activate"}
                        className="text-muted-foreground hover:text-amber-400 transition-colors"
                      >
                        {actionId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <PowerOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => { if (confirm(`Delete promo code "${p.code}"?`)) handleDelete(p.id); }}
                        disabled={actionId === p.id}
                        title="Delete"
                        className="text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <Modal title={editPromo ? "Edit Promo Code" : "New Promo Code"} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} submitting={saving}>
          <div>
            <label className={LABEL}>Code *</label>
            <Input
              value={form.code}
              onChange={e => setField("code", e.target.value.toUpperCase())}
              className={INPUT}
              placeholder="WELCOME20"
              disabled={!!editPromo}
            />
          </div>
          <div>
            <label className={LABEL}>Description *</label>
            <Input value={form.description} onChange={e => setField("description", e.target.value)} className={INPUT} placeholder="Welcome discount for new passengers" />
          </div>
          {!editPromo && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Discount Type *</label>
                  <select value={form.discountType} onChange={e => setField("discountType", e.target.value)} className="bg-white/5 border border-white/10 text-white rounded-none h-10 text-sm px-3 w-full">
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed ($)</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Discount Value *</label>
                  <Input type="number" step="0.01" value={form.discountValue} onChange={e => setField("discountValue", e.target.value)} className={INPUT} placeholder={form.discountType === "percentage" ? "20" : "10.00"} />
                </div>
              </div>
              <div>
                <label className={LABEL}>Max Uses</label>
                <Input type="number" value={form.maxUses} onChange={e => setField("maxUses", e.target.value)} className={INPUT} placeholder="Leave blank for unlimited" />
              </div>
            </>
          )}
          <div>
            <label className={LABEL}>Expiry Date</label>
            <Input type="date" value={form.expiresAt} onChange={e => setField("expiresAt", e.target.value)} className={INPUT} />
          </div>
        </Modal>
      )}
    </PortalLayout>
  );
}
