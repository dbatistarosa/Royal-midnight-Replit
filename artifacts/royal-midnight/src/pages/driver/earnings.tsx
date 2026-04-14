import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { DateRangeFilter, type DateRange } from "@/components/DateRangeFilter";
import { generateDriverReportPdf } from "@/lib/generateDriverReportPdf";
import {
  LayoutDashboard, History, DollarSign, User, Loader2, BarChart2, FileText,
  FileDown, Star,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useDriverStatus } from "@/contexts/driverStatus";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
import { format, startOfMonth, endOfMonth } from "date-fns";

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
  periodEarnings?: number;
  periodRides?: number;
  periodTips?: number;
  commissionPct?: number;
  recentPayouts: { date: string; amount: number; rides: number }[];
};

const fmt$ = (n: number) => `$${n.toFixed(2)}`;

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  borderColor?: string;
}

function StatCard({ label, value, sub, color = "text-foreground", borderColor = "border-border" }: StatCardProps) {
  return (
    <div className={`bg-card border ${borderColor} rounded-none p-5`}>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{label}</p>
      <p className={`text-2xl font-serif font-semibold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function DriverEarnings() {
  const { driverRecord, isLoading: driverLoading } = useDriverStatus();
  const { token } = useAuth();

  const now = new Date();
  const [dateRange, setDateRange] = useState<DateRange | null>({
    startDate: startOfMonth(now),
    endDate: endOfMonth(now),
  });
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!driverRecord?.id || !token) return;
    setIsLoading(true);
    const params = new URLSearchParams();
    if (dateRange) {
      params.set("startDate", dateRange.startDate.toISOString());
      params.set("endDate", dateRange.endDate.toISOString());
    }
    fetch(`${API_BASE}/drivers/${driverRecord.id}/earnings?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() as Promise<EarningsData> : Promise.resolve(null))
      .then(data => setEarnings(data))
      .catch(() => setEarnings(null))
      .finally(() => setIsLoading(false));
  }, [driverRecord?.id, token, dateRange]);

  const dateRangeLabel = dateRange
    ? `${format(dateRange.startDate, "MMM d, yyyy")} – ${format(dateRange.endDate, "MMM d, yyyy")}`
    : "All Time";

  const handleDownloadPdf = async () => {
    if (!earnings) return;
    setPdfLoading(true);
    try {
      await generateDriverReportPdf({
        driverName: driverRecord?.name ?? "Driver",
        dateRangeLabel,
        periodEarnings: earnings.periodEarnings ?? earnings.thisMonth,
        periodTips: earnings.periodTips ?? earnings.tipsThisWeek ?? 0,
        periodRides: earnings.periodRides ?? 0,
        commissionPct: earnings.commissionPct ?? 0.7,
        avgPerRide: earnings.avgPerRide,
        recentPayouts: earnings.recentPayouts,
      });
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <PortalLayout title="Driver Portal" navItems={driverNavItems}>
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
        <h1 className="font-serif text-2xl sm:text-3xl">Earnings</h1>
        <button
          onClick={handleDownloadPdf}
          disabled={pdfLoading || isLoading || !earnings}
          className="flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-widest font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
          Download PDF
        </button>
      </div>

      {/* Date Range Filter */}
      <div className="mb-6 sm:mb-8">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {driverLoading || isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8">

          {/* ── Period Summary Cards ─────────────────────────────────── */}
          <div>
            <h2 className="font-serif text-lg mb-4">{dateRangeLabel}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="Period Earnings"
                value={fmt$(earnings?.periodEarnings ?? earnings?.thisMonth ?? 0)}
                sub="Fare share + tips"
                color="text-primary"
                borderColor="border-primary/20"
              />
              <StatCard
                label="Period Rides"
                value={String(earnings?.periodRides ?? 0)}
                sub="Completed trips"
                color="text-blue-400"
              />
              <StatCard
                label="Period Tips"
                value={fmt$(earnings?.periodTips ?? 0)}
                sub="100% yours"
                color="text-amber-400"
              />
              <StatCard
                label="Avg / Ride"
                value={fmt$(earnings?.avgPerRide ?? 0)}
                sub="All-time average"
                color="text-foreground"
              />
            </div>
          </div>

          {/* ── All-Time Summary ────────────────────────────────────── */}
          <div>
            <h2 className="font-serif text-lg mb-4">All-Time Snapshot</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Today" value={fmt$(earnings?.today ?? 0)} />
              <StatCard label="This Week" value={fmt$(earnings?.thisWeek ?? 0)} />
              <StatCard label="This Month" value={fmt$(earnings?.thisMonth ?? 0)} />
              <StatCard label="All-Time Total" value={fmt$(earnings?.totalEarnings ?? 0)} sub={`${earnings?.totalRides ?? 0} rides`} />
            </div>
          </div>

          {/* ── Tips breakdown ──────────────────────────────────────── */}
          {((earnings?.tipsThisWeek ?? 0) > 0 || (earnings?.tipsTotal ?? 0) > 0) && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="Tips Today" value={fmt$(earnings?.tipsToday ?? 0)} color="text-primary" borderColor="border-primary/20" />
              <StatCard label="Tips This Week" value={fmt$(earnings?.tipsThisWeek ?? 0)} color="text-primary" borderColor="border-primary/20" />
              <StatCard label="Total Tips" value={fmt$(earnings?.tipsTotal ?? 0)} color="text-primary" borderColor="border-primary/20" />
            </div>
          )}

          {/* ── Commission cards ───────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card border border-border rounded-none p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">This Week Commission</p>
              <p className="text-[10px] text-muted-foreground/60 mb-3">Your fare share this week (excl. tips)</p>
              <p className="text-2xl font-serif text-foreground">{fmt$(earnings?.commissionThisWeek ?? 0)}</p>
            </div>
            <div className="bg-card border border-border rounded-none p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">All-Time Commission</p>
              <p className="text-[10px] text-muted-foreground/60 mb-3">Total fare share earned (excl. tips)</p>
              <p className="text-2xl font-serif text-foreground">{fmt$(earnings?.commissionAllTime ?? 0)}</p>
            </div>
          </div>

          {/* ── Daily Chart ─────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-none p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-1">
              <h2 className="font-serif text-xl">
                {dateRange ? "Earnings — Selected Period" : "Earnings (Last 30 Days)"}
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-widest">
                <Star className="w-3.5 h-3.5 text-primary fill-primary" />
                {earnings?.totalRides ?? 0} trips all-time
              </div>
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
                No completed trips in the selected period.
              </div>
            )}
          </div>

          {/* ── Period Trend cards ──────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard
              label="Period Fare Commission"
              value={fmt$(Math.max(0, (earnings?.periodEarnings ?? 0) - (earnings?.periodTips ?? 0)))}
              sub="Your cut of fare revenue"
              color="text-green-400"
            />
            <StatCard
              label="Period Tips"
              value={fmt$(earnings?.periodTips ?? 0)}
              sub="Gratuities received"
              color="text-amber-400"
            />
            <StatCard
              label="Period Total"
              value={fmt$(earnings?.periodEarnings ?? 0)}
              sub="Fare + tips combined"
              color="text-primary"
              borderColor="border-primary/20"
            />
          </div>

        </div>
      )}
    </PortalLayout>
  );
}
