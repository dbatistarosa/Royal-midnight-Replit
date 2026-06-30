import { useState, useEffect, useCallback } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings, Pencil, Loader2, Wallet, Gift, Building2, Receipt } from "lucide-react";
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
  { label: "Extras & Routes", href: "/admin/extras", icon: Tag },
  { label: "Promos", href: "/admin/promos", icon: Tag },
  { label: "Affiliates", href: "/admin/affiliates", icon: Gift },
  { label: "Corporate Accounts", href: "/admin/corporate-accounts", icon: Building2 },
  { label: "Support", href: "/admin/support", icon: MessageSquare },
  { label: "Reports", href: "/admin/reports", icon: BarChart },
  { label: "Payouts", href: "/admin/payouts", icon: Wallet },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

type CorporateAccount = {
  id: number;
  companyName: string;
  billingEmail: string;
  billingAddress: string | null;
  netTermsDays: number;
  volumeDiscountPct: number;
  creditLimit: number | null;
  status: string;
  userCount: number;
  unbilledRides: number;
  unbilledTotal: number;
  createdAt: string;
};

type FormData = {
  companyName: string;
  billingEmail: string;
  billingAddress: string;
  netTermsDays: string;
  volumeDiscountPct: string;
  creditLimit: string;
  status: string;
};

const LABEL = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const INPUT = "bg-white/5 border-white/10 text-white rounded-none h-10 text-sm";

function EditModal({ account, onClose, onSave, saving }: {
  account: CorporateAccount; onClose: () => void; onSave: (form: FormData) => void; saving: boolean;
}) {
  const [form, setForm] = useState<FormData>({
    companyName: account.companyName,
    billingEmail: account.billingEmail,
    billingAddress: account.billingAddress ?? "",
    netTermsDays: String(account.netTermsDays),
    volumeDiscountPct: String(account.volumeDiscountPct),
    creditLimit: account.creditLimit != null ? String(account.creditLimit) : "",
    status: account.status,
  });
  const setField = (k: keyof FormData, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-card border border-border w-full max-w-lg">
        <div className="px-7 py-5 border-b border-border">
          <h2 className="font-serif text-xl">Edit — {account.companyName}</h2>
        </div>
        <div className="p-7 space-y-5">
          <div>
            <label className={LABEL}>Company Name</label>
            <Input value={form.companyName} onChange={e => setField("companyName", e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Billing Email</label>
            <Input value={form.billingEmail} onChange={e => setField("billingEmail", e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Billing Address</label>
            <Input value={form.billingAddress} onChange={e => setField("billingAddress", e.target.value)} className={INPUT} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Net Terms (days)</label>
              <Input type="number" value={form.netTermsDays} onChange={e => setField("netTermsDays", e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Volume Discount (%)</label>
              <Input type="number" step="0.01" value={form.volumeDiscountPct} onChange={e => setField("volumeDiscountPct", e.target.value)} className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Credit Limit ($)</label>
              <Input type="number" step="0.01" value={form.creditLimit} onChange={e => setField("creditLimit", e.target.value)} className={INPUT} placeholder="No limit" />
            </div>
            <div>
              <label className={LABEL}>Status</label>
              <select value={form.status} onChange={e => setField("status", e.target.value)} className="bg-white/5 border border-white/10 text-white rounded-none h-10 text-sm px-3 w-full">
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
        </div>
        <div className="px-7 py-5 border-t border-border flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} className="rounded-none border-white/20 text-white hover:bg-white/10 text-xs uppercase tracking-widest">Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={saving} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-6">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminCorporateAccounts() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<CorporateAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editAccount, setEditAccount] = useState<CorporateAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);

  const authHdr = token ? `Bearer ${token}` : "";

  const refetch = useCallback(() => {
    setIsLoading(true);
    fetch(`${API_BASE}/admin/corporate-accounts`, { headers: { Authorization: authHdr } })
      .then(r => r.ok ? r.json() as Promise<CorporateAccount[]> : Promise.resolve([]))
      .then(data => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => setAccounts([]))
      .finally(() => setIsLoading(false));
  }, [authHdr]);

  useEffect(() => { refetch(); }, [refetch]);

  const handleSave = async (form: FormData) => {
    if (!editAccount) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/corporate-accounts/${editAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHdr },
        body: JSON.stringify({
          companyName: form.companyName,
          billingEmail: form.billingEmail,
          billingAddress: form.billingAddress || null,
          netTermsDays: parseInt(form.netTermsDays, 10),
          volumeDiscountPct: parseFloat(form.volumeDiscountPct),
          creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : null,
          status: form.status,
        }),
      });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Failed"); }
      toast({ title: "Corporate account updated" });
      setEditAccount(null);
      refetch();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not save account.", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleMarkInvoiced = async (account: CorporateAccount) => {
    if (!confirm(`Mark ${account.unbilledRides} ride(s) totaling $${account.unbilledTotal.toFixed(2)} as invoiced for ${account.companyName}? This cannot be undone.`)) return;
    setActionId(account.id);
    try {
      const res = await fetch(`${API_BASE}/admin/corporate-accounts/${account.id}/mark-invoiced`, {
        method: "POST",
        headers: { Authorization: authHdr },
      });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Failed"); }
      const result = await res.json() as { invoicedRides: number; invoicedTotal: number };
      toast({ title: "Marked as invoiced", description: `${result.invoicedRides} ride(s), $${result.invoicedTotal.toFixed(2)} total.` });
      refetch();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not mark as invoiced.", variant: "destructive" });
    }
    setActionId(null);
  };

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 sm:mb-8 gap-3">
        <h1 className="font-serif text-2xl sm:text-3xl">Corporate Accounts</h1>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        Net-30 billing accounts created via the corporate sign-up flow. Each booking made under
        a linked corporate user gets the account's volume discount automatically and is billed
        on this account, not charged to a card.
      </p>

      <div className="bg-card border border-border rounded-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[700px]">
            <thead className="bg-background/50 border-b border-border">
              <tr>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Company</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs hidden md:table-cell">Billing Email</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Terms</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Discount</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Unbilled</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Status</th>
                <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading...
                </td></tr>
              ) : !accounts.length ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                  No corporate accounts yet — create one from Passengers → New Corporate Account.
                </td></tr>
              ) : accounts.map(a => (
                <tr key={a.id} className="hover:bg-background/50 transition-colors">
                  <td className="px-5 py-4 font-medium">{a.companyName}<div className="text-xs text-muted-foreground">{a.userCount} user{a.userCount === 1 ? "" : "s"}</div></td>
                  <td className="px-5 py-4 hidden md:table-cell text-muted-foreground">{a.billingEmail}</td>
                  <td className="px-5 py-4 text-muted-foreground">Net-{a.netTermsDays}</td>
                  <td className="px-5 py-4 text-muted-foreground">{a.volumeDiscountPct}%</td>
                  <td className="px-5 py-4">
                    {a.unbilledRides > 0 ? (
                      <span className="text-primary">{a.unbilledRides} ride{a.unbilledRides === 1 ? "" : "s"} — ${a.unbilledTotal.toFixed(2)}</span>
                    ) : (
                      <span className="text-muted-foreground">$0.00</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className={a.status === "active" ? "text-green-400 text-xs" : "text-gray-400 text-xs"}>
                      {a.status === "active" ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setEditAccount(a)} title="Edit billing terms" className="text-muted-foreground hover:text-white transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMarkInvoiced(a)}
                        disabled={a.unbilledRides === 0 || actionId === a.id}
                        title="Mark unbilled rides as invoiced"
                        className="text-muted-foreground hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {actionId === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editAccount && (
        <EditModal account={editAccount} onClose={() => setEditAccount(null)} onSave={handleSave} saving={saving} />
      )}
    </PortalLayout>
  );
}
