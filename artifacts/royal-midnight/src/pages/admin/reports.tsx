import { useState, useEffect } from "react";
import { useGetRevenueStats } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { DateRangeFilter, type DateRange } from "@/components/DateRangeFilter";
import { generateReportPdf } from "@/lib/generateReportPdf";
import {
  LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare,
  BarChart, Settings, TrendingUp, TrendingDown, CheckCircle, Wallet, FileDown,
  Loader2, CreditCard, Building2, Receipt,
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart as RechartsBarChart, Bar,
} from "recharts";

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

interface FinancialCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
  borderColor?: string;
}

function FinancialCard({ label, value, sub, icon: Icon, color, borderColor }: FinancialCardProps) {
  return (
    <div className={`bg-card border ${borderColor ?? "border-border"} rounded-none p-5`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground leading-tight">{label}</p>
        <Icon className={`w-4 h-4 shrink-0 ${color}`} />
      </div>
      <p className={`text-2xl font-serif font-semibold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function WaterfallRow({ label, value, isDeduction, isFinal }: {
  label: string; value: string; isDeduction?: boolean; isFinal?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-5 py-3 ${
      isFinal ? "bg-green-400/5 border-t border-green-400/20" : "border-b border-border/50"
    }`}>
      <span className={`text-sm ${
        isFinal ? "font-semibold text-green-400" : isDeduction ? "text-muted-foreground" : "text-foreground"
      }`}>{label}</span>
      <span className={`text-sm tabular-nums font-medium ${
        isFinal ? "text-green-400 text-base font-serif" : isDeduction ? "text-red-400" : "text-foreground"
      }`}>{value}</span>
    </div>
  );
}

export default function AdminReports() {
  const now = new Date();
  const [dateRange, setDateRange] = useState<DateRange | null>({
    startDate: startOfMonth(now),
    endDate: endOfMonth(now),
  });
  const [pdfLoading, setPdfLoading] = useState(false);

  const rangeParams = dateRange
    ? { startDate: dateRange.startDate.toISOString(), endDate: dateRange.endDate.toISOString() }
    : undefined;

  const { data: stats, isLoading } = useGetRevenueStats(rangeParams, {
    query: { enabled: true },
  });

  const commissionPctDisplay = stats?.commissionPct != null
    ? `${(stats.commissionPct * 100).toFixed(0)}%`
    : "—";
  const taxPctDisplay = stats?.taxRatePct != null
    ? `${(stats.taxRatePct * 100).toFixed(1)}%`
    : "—";
  const ccFeePctDisplay = stats?.ccFeePct != null
    ? `${(stats.ccFeePct * 100).toFixed(1)}%`
    : "0%";

  const dateRangeLabel = dateRange
    ? `${format(dateRange.startDate, "MMM d, yyyy")} – ${format(dateRange.endDate, "MMM d, yyyy")}`
    : "All Time";

  const handleDownloadPdf = async () => {
    if (!stats) return;
    setPdfLoading(true);
    try {
      await generateReportPdf({
        dateRangeLabel,
        completedRides: stats.completedRides,
        totalGrossIncome: stats.totalGrossIncome ?? stats.totalRevenue,
        totalTaxesCollected: stats.totalTaxesCollected ?? 0,
        totalFeesCollected: stats.totalFeesCollected ?? 0,
        totalDriverCommissions: stats.totalDriverCommissions ?? stats.totalCommissionPaid,
        companyNetIncome: stats.companyNetIncome ?? stats.totalCompanyRevenue,
        taxRatePct: stats.taxRatePct ?? 0,
        ccFeePct: stats.ccFeePct ?? 0,
        commissionPct: stats.commissionPct,
      });
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
        <h1 className="font-serif text-2xl sm:text-3xl">Reports & Analytics</h1>
        <button
          onClick={handleDownloadPdf}
          disabled={pdfLoading || isLoading || !stats}
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

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-8">

          {/* ── Financial Summary Cards ──────────────────────────────────────── */}
          <div>
            <h2 className="font-serif text-lg mb-4">Financial Summary</h2>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <FinancialCard
                label="Total Gross Income"
                value={`$${(stats?.totalGrossIncome ?? stats?.totalRevenue ?? 0).toFixed(2)}`}
                sub={`${stats?.completedRides ?? 0} completed rides`}
                icon={DollarSign}
                color="text-primary"
                borderColor="border-primary/20"
              />
              <FinancialCard
                label="Taxes Collected"
                value={`$${(stats?.totalTaxesCollected ?? 0).toFixed(2)}`}
                sub={`Florida tax @ ${taxPctDisplay}`}
                icon={Receipt}
                color="text-blue-400"
              />
              <FinancialCard
                label="CC Processing Fees"
                value={`$${(stats?.totalFeesCollected ?? 0).toFixed(2)}`}
                sub={`CC fee @ ${ccFeePctDisplay}`}
                icon={CreditCard}
                color="text-amber-400"
              />
              <FinancialCard
                label="Driver Commissions"
                value={`$${(stats?.totalDriverCommissions ?? stats?.totalCommissionPaid ?? 0).toFixed(2)}`}
                sub={`Driver share @ ${commissionPctDisplay}`}
                icon={TrendingDown}
                color="text-orange-400"
              />
              <FinancialCard
                label="Company Net Income"
                value={`$${(stats?.companyNetIncome ?? stats?.totalCompanyRevenue ?? 0).toFixed(2)}`}
                sub="After all deductions"
                icon={Building2}
                color="text-green-400"
                borderColor="border-green-400/20"
              />
            </div>
          </div>

          {/* ── Calculation Waterfall ────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-none overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-serif text-lg">Income Calculation</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{dateRangeLabel}</p>
            </div>
            <WaterfallRow
              label="Gross Income (charged to passengers)"
              value={`$${(stats?.totalGrossIncome ?? stats?.totalRevenue ?? 0).toFixed(2)}`}
            />
            <WaterfallRow
              label={`– Florida Taxes @ ${taxPctDisplay}`}
              value={`($${(stats?.totalTaxesCollected ?? 0).toFixed(2)})`}
              isDeduction
            />
            <WaterfallRow
              label={`– CC Processing Fees @ ${ccFeePctDisplay}`}
              value={`($${(stats?.totalFeesCollected ?? 0).toFixed(2)})`}
              isDeduction
            />
            <WaterfallRow
              label={`– Driver Commissions @ ${commissionPctDisplay} of subtotal`}
              value={`($${(stats?.totalDriverCommissions ?? stats?.totalCommissionPaid ?? 0).toFixed(2)})`}
              isDeduction
            />
            <WaterfallRow
              label="= Company Net Income"
              value={`$${(stats?.companyNetIncome ?? stats?.totalCompanyRevenue ?? 0).toFixed(2)}`}
              isFinal
            />
          </div>

          {/* ── Revenue Split Visual ──────────────────────────────────────────── */}
          {(stats?.totalRevenue ?? 0) > 0 && (
            <div className="bg-card border border-border rounded-none p-6">
              <h2 className="font-serif text-lg mb-4">Revenue Split</h2>
              <div className="flex flex-wrap gap-4 text-sm mb-3">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-400 inline-block" />
                  Company Net ({stats?.commissionPct != null ? `${Math.round((1 - stats.commissionPct) * 100)}%` : "—"})
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
                  Drivers ({commissionPctDisplay})
                </span>
                {(stats?.totalTaxesCollected ?? 0) > 0 && (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-400 inline-block" />
                    Taxes
                  </span>
                )}
                {(stats?.totalFeesCollected ?? 0) > 0 && (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" />
                    CC Fees
                  </span>
                )}
              </div>
              {(() => {
                const gross = stats?.totalGrossIncome ?? stats?.totalRevenue ?? 0;
                if (gross === 0) return null;
                const net = (stats?.companyNetIncome ?? stats?.totalCompanyRevenue ?? 0);
                const taxes = stats?.totalTaxesCollected ?? 0;
                const fees = stats?.totalFeesCollected ?? 0;
                const comms = stats?.totalDriverCommissions ?? stats?.totalCommissionPaid ?? 0;
                return (
                  <>
                    <div className="w-full h-5 bg-background border border-border overflow-hidden flex">
                      <div className="h-full bg-green-400/70 transition-all" style={{ width: `${Math.round(net / gross * 100)}%` }} />
                      <div className="h-full bg-amber-400/70 transition-all" style={{ width: `${Math.round(comms / gross * 100)}%` }} />
                      <div className="h-full bg-blue-400/70 transition-all" style={{ width: `${Math.round(taxes / gross * 100)}%` }} />
                      <div className="h-full bg-orange-400/70 transition-all" style={{ width: `${Math.round(fees / gross * 100)}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-2">
                      <span>Net: ${net.toFixed(2)}</span>
                      <span>Drivers: ${comms.toFixed(2)}</span>
                      <span>Taxes: ${taxes.toFixed(2)}</span>
                      <span>Fees: ${fees.toFixed(2)}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* ── Revenue Chart ─────────────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-none p-6">
            <h2 className="font-serif text-xl mb-6">
              {dateRange ? "Revenue — Selected Period" : "Daily Revenue (Last 30 Days)"}
            </h2>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats?.daily ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(v: number) => [`$${v.toFixed(2)}`, "Gross Revenue"]}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── By Vehicle Class ─────────────────────────────────────────────── */}
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-card border border-border rounded-none p-6">
              <h2 className="font-serif text-xl mb-6">Revenue by Class</h2>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={stats?.byVehicleClass ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="vehicleClass" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => v === "business" ? "Business" : v === "suv" ? "SUV" : v} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]}
                    />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-card border border-border rounded-none p-6">
              <h2 className="font-serif text-xl mb-6">Bookings by Class</h2>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={stats?.byVehicleClass ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="vehicleClass" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => v === "business" ? "Business" : v === "suv" ? "SUV" : v} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Bar dataKey="bookings" fill="hsl(var(--muted-foreground))" radius={[2, 2, 0, 0]} />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ── Completed Rides stat ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <FinancialCard
              label="Completed Rides"
              value={String(stats?.completedRides ?? 0)}
              sub={dateRangeLabel}
              icon={CheckCircle}
              color="text-blue-400"
            />
            <FinancialCard
              label="Avg. per Ride"
              value={(stats?.completedRides ?? 0) > 0
                ? `$${((stats?.totalGrossIncome ?? stats?.totalRevenue ?? 0) / (stats?.completedRides ?? 1)).toFixed(2)}`
                : "$0.00"}
              sub="Gross income / ride"
              icon={TrendingUp}
              color="text-primary"
            />
            <FinancialCard
              label="Driver Rate"
              value={commissionPctDisplay}
              sub="Of subtotal (excl. taxes & fees)"
              icon={TrendingDown}
              color="text-orange-400"
            />
            <FinancialCard
              label="Company Margin"
              value={(stats?.totalGrossIncome ?? stats?.totalRevenue ?? 0) > 0
                ? `${Math.round(((stats?.companyNetIncome ?? stats?.totalCompanyRevenue ?? 0) / (stats?.totalGrossIncome ?? stats?.totalRevenue ?? 1)) * 100)}%`
                : "—"}
              sub="Net / Gross"
              icon={Building2}
              color="text-green-400"
            />
          </div>

        </div>
      )}
    </PortalLayout>
  );
}
