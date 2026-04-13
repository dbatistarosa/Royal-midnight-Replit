import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, History, DollarSign, User, Loader2, BarChart2, FileText } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useDriverStatus } from "@/contexts/driverStatus";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";

const driverNavItems = [
  { label: "Dashboard", href: "/driver/dashboard", icon: LayoutDashboard },
  { label: "Finished",  href: "/driver/history",   icon: History },
  { label: "Earnings",  href: "/driver/earnings",  icon: DollarSign },
  { label: "Stats",     href: "/driver/stats",     icon: BarChart2 },
  { label: "Documents", href: "/driver/documents", icon: FileText },
  { label: "Profile",   href: "/driver/profile",   icon: User },
];

type EarningsData = {
  today: number;
  thisWeek: number;
  thisMonth: number;
  totalEarnings: number;
  totalRides: number;
  avgPerRide: number;
  commissionAllTime?: number;
  commissionThisWeek?: number;
  tipsTotal?: number;
  tipsThisWeek?: number;
  tipsToday?: number;
  recentPayouts: { date: string; amount: number; rides: number }[];
};

const fmt$ = (n: number) => `$${n.toFixed(2)}`;

export default function DriverEarnings() {
  const { driverRecord, isLoading: driverLoading } = useDriverStatus();
  const { token } = useAuth();
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!driverRecord?.id || !token) return;
    setIsLoading(true);
    fetch(`${API_BASE}/drivers/${driverRecord.id}/earnings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() as Promise<EarningsData> : Promise.resolve(null))
      .then(data => setEarnings(data))
      .catch(() => setEarnings(null))
      .finally(() => setIsLoading(false));
  }, [driverRecord?.id, token]);

  return (
    <PortalLayout title="Driver Portal" navItems={driverNavItems}>
      <h1 className="font-serif text-2xl sm:text-3xl mb-6 sm:mb-8">Earnings</h1>

      {driverLoading || isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
            <div className="bg-card border border-border rounded-none p-6">
              <h3 className="text-muted-foreground text-xs uppercase tracking-widest font-medium mb-2">Today</h3>
              <div className="text-3xl font-serif text-primary">{fmt$(earnings?.today ?? 0)}</div>
            </div>
            <div className="bg-card border border-border rounded-none p-6">
              <h3 className="text-muted-foreground text-xs uppercase tracking-widest font-medium mb-2">This Week</h3>
              <div className="text-3xl font-serif text-foreground">{fmt$(earnings?.thisWeek ?? 0)}</div>
            </div>
            <div className="bg-card border border-border rounded-none p-6">
              <h3 className="text-muted-foreground text-xs uppercase tracking-widest font-medium mb-2">This Month</h3>
              <div className="text-3xl font-serif text-foreground">{fmt$(earnings?.thisMonth ?? 0)}</div>
            </div>
            <div className="bg-card border border-border rounded-none p-6">
              <h3 className="text-muted-foreground text-xs uppercase tracking-widest font-medium mb-2">Avg / Ride</h3>
              <div className="text-3xl font-serif text-foreground">{fmt$(earnings?.avgPerRide ?? 0)}</div>
            </div>
          </div>
          {((earnings?.tipsThisWeek ?? 0) > 0 || (earnings?.tipsTotal ?? 0) > 0) && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
              <div className="bg-card border border-primary/20 rounded-none p-6">
                <h3 className="text-primary/70 text-xs uppercase tracking-widest font-medium mb-2">Tips Today</h3>
                <div className="text-3xl font-serif text-primary">{fmt$(earnings?.tipsToday ?? 0)}</div>
              </div>
              <div className="bg-card border border-primary/20 rounded-none p-6">
                <h3 className="text-primary/70 text-xs uppercase tracking-widest font-medium mb-2">Tips This Week</h3>
                <div className="text-3xl font-serif text-primary">{fmt$(earnings?.tipsThisWeek ?? 0)}</div>
              </div>
              <div className="bg-card border border-primary/20 rounded-none p-6">
                <h3 className="text-primary/70 text-xs uppercase tracking-widest font-medium mb-2">Total Tips</h3>
                <div className="text-3xl font-serif text-primary">{fmt$(earnings?.tipsTotal ?? 0)}</div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:gap-6">
            <div className="bg-card border border-border rounded-none p-6">
              <h3 className="text-muted-foreground text-xs uppercase tracking-widest font-medium mb-1">This Week Commission</h3>
              <p className="text-[10px] text-muted-foreground/60 mb-3">Your fare share this week (excl. tips)</p>
              <div className="text-3xl font-serif text-foreground">{fmt$(earnings?.commissionThisWeek ?? 0)}</div>
            </div>
            <div className="bg-card border border-border rounded-none p-6">
              <h3 className="text-muted-foreground text-xs uppercase tracking-widest font-medium mb-1">All-Time Commission</h3>
              <p className="text-[10px] text-muted-foreground/60 mb-3">Total fare share earned (excl. tips)</p>
              <div className="text-3xl font-serif text-foreground">{fmt$(earnings?.commissionAllTime ?? 0)}</div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-none p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-1">
              <h2 className="font-serif text-xl">Earnings (Last 30 Days)</h2>
              <span className="text-xs text-muted-foreground uppercase tracking-widest">Driver share · {earnings?.totalRides ?? 0} trips total</span>
            </div>
            {earnings?.recentPayouts && earnings.recentPayouts.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={earnings.recentPayouts}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 0 }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(val: number) => [`$${val.toFixed(2)}`, "Your earnings"]}
                    />
                    <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                No completed trips in the last 30 days.
              </div>
            )}
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
