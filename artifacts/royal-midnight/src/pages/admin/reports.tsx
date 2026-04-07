import { useGetRevenueStats } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings, TrendingUp, TrendingDown, CheckCircle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart as RechartsBarChart, Bar } from "recharts";

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

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-none p-6">
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className={`text-2xl font-serif font-semibold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminReports() {
  const { data: stats, isLoading } = useGetRevenueStats({ query: { enabled: true, queryKey: ["revenueStats"] } });

  const commissionPctDisplay = stats?.commissionPct != null
    ? `${Math.round(stats.commissionPct * 100)}%`
    : "—";

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <h1 className="font-serif text-2xl sm:text-3xl mb-6 sm:mb-8">Reports & Analytics</h1>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading reports...</div>
      ) : (
        <div className="space-y-8">

          {/* Financial summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Gross Revenue"
              value={`$${(stats?.totalRevenue ?? 0).toFixed(2)}`}
              sub={`${stats?.completedRides ?? 0} completed rides`}
              icon={DollarSign}
              color="text-primary"
            />
            <StatCard
              label="Company Net"
              value={`$${(stats?.totalCompanyRevenue ?? 0).toFixed(2)}`}
              sub={`After ${commissionPctDisplay} driver commission`}
              icon={TrendingUp}
              color="text-green-400"
            />
            <StatCard
              label="Driver Commission"
              value={`$${(stats?.totalCommissionPaid ?? 0).toFixed(2)}`}
              sub={`${commissionPctDisplay} of gross revenue`}
              icon={TrendingDown}
              color="text-amber-400"
            />
            <StatCard
              label="Completed Rides"
              value={String(stats?.completedRides ?? 0)}
              sub="All time"
              icon={CheckCircle}
              color="text-blue-400"
            />
          </div>

          {/* Revenue split visual */}
          {(stats?.totalRevenue ?? 0) > 0 && (
            <div className="bg-card border border-border rounded-none p-6">
              <h2 className="font-serif text-lg mb-4">Revenue Split</h2>
              <div className="flex gap-4 text-sm mb-3">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-400 inline-block" />
                  Company {commissionPctDisplay !== "—" ? `(${Math.round((1 - (stats?.commissionPct ?? 0)) * 100)}%)` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
                  Drivers ({commissionPctDisplay})
                </span>
              </div>
              <div className="w-full h-4 bg-card border border-border overflow-hidden flex">
                <div
                  className="h-full bg-green-400/70 transition-all"
                  style={{ width: `${Math.round((1 - (stats?.commissionPct ?? 0)) * 100)}%` }}
                />
                <div
                  className="h-full bg-amber-400/70 transition-all"
                  style={{ width: `${Math.round((stats?.commissionPct ?? 0) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>Company: ${(stats?.totalCompanyRevenue ?? 0).toFixed(2)}</span>
                <span>Drivers: ${(stats?.totalCommissionPaid ?? 0).toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="bg-card border border-border rounded-none p-6">
            <h2 className="font-serif text-xl mb-6">Daily Revenue (Last 30 Days)</h2>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats?.daily || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, "Revenue"]}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-card border border-border rounded-none p-6">
              <h2 className="font-serif text-xl mb-6">Revenue by Class</h2>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={stats?.byVehicleClass || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="vehicleClass" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => val === "business" ? "Business" : "SUV"} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, "Revenue"]}
                    />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-card border border-border rounded-none p-6">
              <h2 className="font-serif text-xl mb-6">Bookings by Class</h2>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={stats?.byVehicleClass || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="vehicleClass" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => val === "business" ? "Business" : "SUV"} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Bar dataKey="bookings" fill="hsl(var(--muted-foreground))" radius={[2, 2, 0, 0]} />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
