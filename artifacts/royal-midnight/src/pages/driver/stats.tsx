import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, History, DollarSign, User, Loader2, BarChart2, FileText } from "lucide-react";
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
  tipsTotal?: number;
  tipsThisWeek?: number;
  tipsToday?: number;
  recentPayouts: { date: string; amount: number; rides: number }[];
};

const fmt$ = (n: number) => `$${n.toFixed(2)}`;

export default function DriverStats() {
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

  const rating = driverRecord?.rating != null ? parseFloat(String(driverRecord.rating)) : null;
  const totalRides = driverRecord?.totalRides ?? 0;

  const stats = [
    { label: "Avg Rating", value: rating != null ? `${rating.toFixed(2)} / 5` : "—", sub: "Overall score" },
    { label: "Total Rides", value: String(totalRides), sub: "Completed trips" },
    { label: "Total Earnings", value: fmt$(earnings?.totalEarnings ?? 0), sub: "Driver share (all time)" },
    { label: "Total Tips", value: fmt$(earnings?.tipsTotal ?? 0), sub: "All-time tip income", accent: true },
    { label: "Avg / Ride", value: fmt$(earnings?.avgPerRide ?? 0), sub: "Commission-based avg" },
    { label: "This Month", value: fmt$(earnings?.thisMonth ?? 0), sub: "Current month" },
    { label: "This Week", value: fmt$(earnings?.thisWeek ?? 0), sub: "Current week" },
    { label: "Tips This Week", value: fmt$(earnings?.tipsThisWeek ?? 0), sub: "Tip income this week", accent: true },
  ];

  return (
    <PortalLayout title="Driver Portal" navItems={driverNavItems}>
      <h1 className="font-serif text-2xl sm:text-3xl mb-6 sm:mb-8">My Stats</h1>

      {driverLoading || isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
          {stats.map(s => (
            <div key={s.label} className={`bg-card border p-6 ${s.accent ? "border-primary/20" : "border-border"}`}>
              <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">{s.label}</div>
              <div className={`text-2xl sm:text-3xl font-serif mb-1 ${s.accent ? "text-primary" : ""}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.sub}</div>
            </div>
          ))}
        </div>
      )}
    </PortalLayout>
  );
}
