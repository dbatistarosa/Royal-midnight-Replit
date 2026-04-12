import { useState, useEffect, useCallback } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import {
  LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag,
  MessageSquare, BarChart, Settings, Wallet, Loader2, Send,
  CheckCircle, AlertTriangle, Pencil, X, ChevronLeft, ChevronRight, RefreshCw,
} from "lucide-react";
import { format, startOfWeek, addWeeks, subWeeks } from "date-fns";
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
  { label: "Payouts", href: "/admin/payouts", icon: Wallet },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

type DriverPayout = {
  driverId: number;
  driverName: string;
  driverEmail: string;
  driverPhone: string;
  rides: number;
  grossEarnings: number;
  commissionPct: number;
  tipsTotal: number;
  driverNet: number;
  bankName: string | null;
  routingNumber: string | null;
  accountNumber: string | null;
  legalName: string | null;
  payoutEmail: string;
  hasBankDetails: boolean;
};

type PayoutBoard = {
  weekStart: string;
  weekEnd: string;
  commissionPct: number;
  payouts: DriverPayout[];
  totalGross: number;
  totalDriverNet: number;
};

type BankForm = {
  legalName: string;
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  payoutEmail: string;
};

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function AdminPayouts() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [board, setBoard] = useState<PayoutBoard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [editDriver, setEditDriver] = useState<DriverPayout | null>(null);
  const [bankForm, setBankForm] = useState<BankForm>({ legalName: "", bankName: "", routingNumber: "", accountNumber: "", payoutEmail: "" });
  const [savingBank, setSavingBank] = useState(false);

  const authHdr = token ? `Bearer ${token}` : "";

  const currentWeekStart = getMonday(addWeeks(new Date(), weekOffset));

  const fetchPayouts = useCallback(() => {
    if (!token) return;
    setIsLoading(true);
    const weekParam = format(currentWeekStart, "yyyy-MM-dd");
    fetch(`${API_BASE}/admin/payouts/weekly?week=${weekParam}`, { headers: { Authorization: authHdr } })
      .then(r => r.ok ? r.json() as Promise<PayoutBoard> : Promise.reject(new Error("Failed")))
      .then(data => setBoard(data))
      .catch(() => toast({ title: "Error", description: "Could not load payout data.", variant: "destructive" }))
      .finally(() => setIsLoading(false));
  }, [token, authHdr, weekOffset]);

  useEffect(() => { fetchPayouts(); }, [fetchPayouts]);

  const handleSendEmails = async () => {
    if (!confirm(`Send weekly payout emails to all drivers and the admin report for the week of ${board?.weekStart ? format(new Date(board.weekStart), "MMM d, yyyy") : "this week"}?`)) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/admin/payouts/send-weekly`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHdr },
        body: JSON.stringify({ weekStart: board?.weekStart }),
      });
      const data = await res.json() as { ok?: boolean; emailsSent?: number; weekLabel?: string };
      if (res.ok && data.ok) {
        toast({ title: "Emails sent!", description: `Sent ${data.emailsSent} driver emails + admin report for ${data.weekLabel}.` });
      } else {
        throw new Error("Failed to send emails");
      }
    } catch {
      toast({ title: "Error", description: "Could not send payout emails.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const openBankEdit = (driver: DriverPayout) => {
    setEditDriver(driver);
    setBankForm({
      legalName: driver.legalName ?? "",
      bankName: driver.bankName ?? "",
      routingNumber: driver.routingNumber ?? "",
      accountNumber: driver.accountNumber ?? "",
      payoutEmail: driver.payoutEmail ?? driver.driverEmail,
    });
  };

  const handleSaveBank = async () => {
    if (!editDriver) return;
    setSavingBank(true);
    try {
      const res = await fetch(`${API_BASE}/admin/drivers/${editDriver.driverId}/bank`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHdr },
        body: JSON.stringify(bankForm),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Bank details saved", description: `Updated banking info for ${editDriver.driverName}.` });
      setEditDriver(null);
      fetchPayouts();
    } catch {
      toast({ title: "Error", description: "Could not save bank details.", variant: "destructive" });
    } finally {
      setSavingBank(false);
    }
  };

  const weekLabel = board
    ? format(new Date(board.weekStart), "MMM d") + " – " + format(new Date(new Date(board.weekEnd).getTime() - 1), "MMM d, yyyy")
    : "";

  const companyNet = board
    ? Math.round((board.totalGross - board.totalDriverNet) * 100) / 100
    : 0;

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl">Driver Payouts</h1>
          <p className="text-sm text-muted-foreground mt-1">Weekly earnings per driver · Emails sent every Monday at 8 AM</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-none border-white/20 text-white hover:bg-white/10 px-2"
            onClick={() => setWeekOffset(w => w - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium px-3 py-1.5 border border-border min-w-[180px] text-center">
            {board ? weekLabel : "Loading..."}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="rounded-none border-white/20 text-white hover:bg-white/10 px-2"
            onClick={() => setWeekOffset(w => Math.min(0, w + 1))}
            disabled={weekOffset >= 0}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-none border-white/20 text-white hover:bg-white/10 px-2"
            onClick={fetchPayouts}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {board && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border border-border p-5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Total Gross</p>
            <p className="font-serif text-2xl text-primary">${board.totalGross.toFixed(2)}</p>
          </div>
          <div className="bg-card border border-border p-5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Total Driver Payouts</p>
            <p className="font-serif text-2xl text-amber-400">${board.totalDriverNet.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">{Math.round(board.commissionPct * 100)}% commission + tips</p>
          </div>
          <div className="bg-card border border-border p-5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Company Net</p>
            <p className="font-serif text-2xl text-green-400">${companyNet.toFixed(2)}</p>
          </div>
          <div className="bg-card border border-border p-5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Active Drivers</p>
            <p className="font-serif text-2xl">{board.payouts.length}</p>
          </div>
        </div>
      )}

      {/* Send Button */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-lg">Driver Breakdown</h2>
        <Button
          onClick={() => void handleSendEmails()}
          disabled={sending || isLoading}
          className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-5 min-h-[44px]"
        >
          {sending ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" />Sending...</>
          ) : (
            <><Send className="w-4 h-4 mr-2" />Send Weekly Emails</>
          )}
        </Button>
      </div>

      {/* Driver Table */}
      <div className="bg-card border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !board?.payouts.length ? (
          <div className="p-12 text-center text-muted-foreground">No approved drivers found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-background/50 border-b border-border">
                <tr>
                  <th className="px-5 py-4 text-left text-xs text-muted-foreground uppercase tracking-widest font-medium">Driver</th>
                  <th className="px-5 py-4 text-center text-xs text-muted-foreground uppercase tracking-widest font-medium">Rides</th>
                  <th className="px-5 py-4 text-right text-xs text-muted-foreground uppercase tracking-widest font-medium">Gross</th>
                  <th className="px-5 py-4 text-right text-xs text-muted-foreground uppercase tracking-widest font-medium">Tips</th>
                  <th className="px-5 py-4 text-right text-xs text-muted-foreground uppercase tracking-widest font-medium">Total to Driver</th>
                  <th className="px-5 py-4 text-left text-xs text-muted-foreground uppercase tracking-widest font-medium">Bank Details</th>
                  <th className="px-5 py-4 text-left text-xs text-muted-foreground uppercase tracking-widest font-medium">Status</th>
                  <th className="px-5 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {board.payouts.map(driver => (
                  <tr key={driver.driverId} className="hover:bg-background/30 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-medium">{driver.driverName}</div>
                      <div className="text-xs text-muted-foreground">{driver.payoutEmail}</div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={driver.rides > 0 ? "text-white font-medium" : "text-muted-foreground"}>
                        {driver.rides}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className={driver.grossEarnings > 0 ? "text-white" : "text-muted-foreground"}>
                        ${driver.grossEarnings.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {driver.tipsTotal > 0
                        ? <span className="text-primary font-medium">+${driver.tipsTotal.toFixed(2)}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className={`font-medium ${driver.driverNet > 0 ? "text-primary text-base" : "text-muted-foreground"}`}>
                        ${driver.driverNet.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {driver.bankName ? (
                        <div>
                          <div className="text-sm">{driver.bankName}</div>
                          {driver.routingNumber && (
                            <div className="text-xs text-muted-foreground font-mono">
                              Routing: {driver.routingNumber}
                            </div>
                          )}
                          {driver.accountNumber && (
                            <div className="text-xs text-muted-foreground font-mono">
                              Acct: ****{driver.accountNumber.slice(-4)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Not on file</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {driver.hasBankDetails ? (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Ready
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Missing info
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => openBankEdit(driver)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition-colors px-3 py-1.5 border border-border hover:border-white/30"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        {driver.hasBankDetails ? "Edit Bank" : "Add Bank"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Payout emails are automatically sent every Monday at 8 AM. Each driver receives their individual earnings statement. Admin receives the full report with bank details.
      </p>

      {/* Bank Details Edit Modal */}
      {editDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-card border border-border w-full max-w-lg">
            <div className="flex items-center justify-between px-7 py-5 border-b border-border">
              <h2 className="font-serif text-xl">Bank Details — {editDriver.driverName}</h2>
              <button onClick={() => setEditDriver(null)} className="text-muted-foreground hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-7 space-y-4">
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-1.5">Legal Name (as on bank account)</label>
                <Input
                  className="bg-white/5 border-white/10 text-white rounded-none"
                  value={bankForm.legalName}
                  onChange={e => setBankForm(f => ({ ...f, legalName: e.target.value }))}
                  placeholder="Full legal name"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-1.5">Payout Email</label>
                <Input
                  className="bg-white/5 border-white/10 text-white rounded-none"
                  value={bankForm.payoutEmail}
                  onChange={e => setBankForm(f => ({ ...f, payoutEmail: e.target.value }))}
                  placeholder="email@example.com"
                  type="email"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-1.5">Bank Name</label>
                <Input
                  className="bg-white/5 border-white/10 text-white rounded-none"
                  value={bankForm.bankName}
                  onChange={e => setBankForm(f => ({ ...f, bankName: e.target.value }))}
                  placeholder="e.g. Chase, Bank of America"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-1.5">Routing Number</label>
                <Input
                  className="bg-white/5 border-white/10 text-white rounded-none font-mono"
                  value={bankForm.routingNumber}
                  onChange={e => setBankForm(f => ({ ...f, routingNumber: e.target.value.replace(/\D/g, "") }))}
                  placeholder="9 digits"
                  maxLength={9}
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground block mb-1.5">Account Number</label>
                <Input
                  className="bg-white/5 border-white/10 text-white rounded-none font-mono"
                  value={bankForm.accountNumber}
                  onChange={e => setBankForm(f => ({ ...f, accountNumber: e.target.value.replace(/\D/g, "") }))}
                  placeholder="Account number"
                />
              </div>
            </div>
            <div className="px-7 py-5 border-t border-border flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditDriver(null)} className="rounded-none border-white/20 text-white hover:bg-white/10 text-xs uppercase tracking-widest">
                Cancel
              </Button>
              <Button onClick={() => void handleSaveBank()} disabled={savingBank} className="bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest px-6">
                {savingBank ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
