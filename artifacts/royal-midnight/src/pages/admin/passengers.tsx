import { useListUsers } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings, Wallet, Shield, ChevronDown, ChevronUp, Save, X } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";

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
  { label: "Payouts", href: "/admin/payouts", icon: Wallet },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

type Passenger = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  createdAt: string | Date;
  vipNotes?: string | null;
};

function VipNotesRow({ passenger, token, onSaved }: { passenger: Passenger; token: string; onSaved: (id: number, notes: string | null) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(passenger.vipNotes ?? "");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const hasNotes = !!passenger.vipNotes?.trim();

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/users/${passenger.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ vipNotes: draft.trim() || null }),
      });
      if (!res.ok) throw new Error("Failed");
      onSaved(passenger.id, draft.trim() || null);
      toast({ title: "VIP notes saved" });
      setExpanded(false);
    } catch {
      toast({ title: "Error", description: "Could not save notes.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <tr
        className="hover:bg-background/50 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-6 py-4 font-medium text-muted-foreground">#{passenger.id}</td>
        <td className="px-6 py-4 font-medium">
          <div className="flex items-center gap-2">
            {passenger.name}
            {hasNotes && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-widest bg-primary/10 text-primary border border-primary/20">
                <Shield className="w-2.5 h-2.5" /> VIP
              </span>
            )}
          </div>
        </td>
        <td className="px-6 py-4 text-muted-foreground">{passenger.email}</td>
        <td className="px-6 py-4 text-muted-foreground">{passenger.phone ?? "—"}</td>
        <td className="px-6 py-4 text-muted-foreground">
          {format(new Date(passenger.createdAt), "MMM d, yyyy")}
        </td>
        <td className="px-6 py-4 text-right">
          {expanded
            ? <ChevronUp className="w-4 h-4 text-muted-foreground ml-auto" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-primary/5 border-b border-primary/20">
          <td colSpan={6} className="px-6 py-4">
            <div className="max-w-xl">
              <p className="text-xs uppercase tracking-widest text-primary mb-2 flex items-center gap-1.5">
                <Shield className="w-3 h-3" /> VIP / Admin Notes
                <span className="text-muted-foreground normal-case tracking-normal font-normal">— Never visible to passenger or driver (admin only)</span>
              </p>
              <textarea
                className="w-full bg-background border border-primary/30 text-sm text-white p-3 resize-none focus:outline-none focus:border-primary placeholder:text-muted-foreground"
                rows={3}
                placeholder="e.g. CEO of Acme Corp · Prefers front-of-terminal pickup · Very high-value client"
                value={draft}
                onChange={e => setDraft(e.target.value)}
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-black text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? "Saving..." : "Save Notes"}
                </button>
                <button
                  onClick={() => { setExpanded(false); setDraft(passenger.vipNotes ?? ""); }}
                  className="flex items-center gap-1.5 px-4 py-2 border border-white/20 text-xs uppercase tracking-widest text-muted-foreground hover:text-white"
                >
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminPassengers() {
  const { data: rawPassengers, isLoading } = useListUsers({ role: "passenger" });
  const { token } = useAuth();
  const [vipNoteOverrides, setVipNoteOverrides] = useState<Record<number, string | null>>({});

  const passengers: Passenger[] = (rawPassengers ?? []).map(p => ({
    ...p,
    phone: (p as Passenger).phone,
    createdAt: typeof p.createdAt === "string" ? p.createdAt : (p.createdAt as Date).toISOString(),
    vipNotes: vipNoteOverrides[p.id] !== undefined ? vipNoteOverrides[p.id] : (p as Passenger).vipNotes ?? null,
  }));

  const handleSaved = (id: number, notes: string | null) => {
    setVipNoteOverrides(prev => ({ ...prev, [id]: notes }));
  };

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <h1 className="font-serif text-2xl sm:text-3xl mb-2">Passengers</h1>
      <p className="text-sm text-muted-foreground mb-6">Click any row to view or edit VIP notes.</p>

      <div className="bg-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[600px]">
            <thead className="bg-background/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium text-muted-foreground">ID</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Name</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Email</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Phone</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Joined</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Loading passengers...</td>
                </tr>
              ) : passengers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">No passengers yet.</td>
                </tr>
              ) : passengers.map(passenger => (
                <VipNotesRow
                  key={passenger.id}
                  passenger={passenger}
                  token={token ?? ""}
                  onSaved={handleSaved}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  );
}
