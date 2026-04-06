import { useGetAdminStats, useGetRecentBookings } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { STATUS_COLORS } from "@/lib/constants";
import { format } from "date-fns";
import { Loader2, Users, Car, DollarSign, Calendar, Activity, Map, Tag, MessageSquare, BarChart, LayoutDashboard } from "lucide-react";
import { Link } from "wouter";

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
];

function AdminInner() {
  const { data: stats, isLoading: statsLoading } = useGetAdminStats();
  const { data: bookings, isLoading: bookingsLoading } = useGetRecentBookings({ limit: 10 });

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="font-serif text-3xl mb-1">Director's Office</h1>
          <p className="text-muted-foreground text-sm">System overview and real-time operations.</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-primary mb-1">System Status</p>
          <p className="text-sm flex items-center justify-end gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Operational
          </p>
        </div>
      </div>

      {statsLoading || bookingsLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            <div className="bg-card border border-border p-6 rounded-lg flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-primary/10 rounded-full">
                  <DollarSign className="w-5 h-5 text-primary" />
                </div>
                <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">+12%</span>
              </div>
              <div>
                <p className="text-muted-foreground uppercase tracking-widest text-xs mb-1">Total Revenue</p>
                <h3 className="text-3xl font-serif">${stats?.totalRevenue?.toLocaleString() || "0"}</h3>
              </div>
            </div>

            <div className="bg-card border border-border p-6 rounded-lg flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-primary/10 rounded-full">
                  <Activity className="w-5 h-5 text-primary" />
                </div>
              </div>
              <div>
                <p className="text-muted-foreground uppercase tracking-widest text-xs mb-1">Active Rides</p>
                <h3 className="text-3xl font-serif">{stats?.activeBookings || 0}</h3>
              </div>
            </div>

            <div className="bg-card border border-border p-6 rounded-lg flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-primary/10 rounded-full">
                  <Users className="w-5 h-5 text-primary" />
                </div>
              </div>
              <div>
                <p className="text-muted-foreground uppercase tracking-widest text-xs mb-1">Active Drivers</p>
                <h3 className="text-3xl font-serif">
                  {stats?.activeDrivers || 0}{" "}
                  <span className="text-sm text-muted-foreground font-sans">/ {stats?.totalDrivers || 0}</span>
                </h3>
              </div>
            </div>

            <div className="bg-card border border-border p-6 rounded-lg flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-primary/10 rounded-full">
                  <Car className="w-5 h-5 text-primary" />
                </div>
              </div>
              <div>
                <p className="text-muted-foreground uppercase tracking-widest text-xs mb-1">Available Fleet</p>
                <h3 className="text-3xl font-serif">
                  {stats?.availableVehicles || 0}{" "}
                  <span className="text-sm text-muted-foreground font-sans">/ {stats?.fleetSize || 0}</span>
                </h3>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-8">
            <div className="flex justify-between items-center mb-8">
              <h2 className="font-serif text-xl">Recent Operations</h2>
              <Link href="/admin/bookings" className="text-primary text-xs uppercase tracking-widest hover:text-foreground transition-colors">
                View All
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground uppercase tracking-widest text-xs border-b border-border">
                  <tr>
                    <th className="pb-4 font-medium">Ref / Date</th>
                    <th className="pb-4 font-medium">Client</th>
                    <th className="pb-4 font-medium">Route</th>
                    <th className="pb-4 font-medium">Vehicle</th>
                    <th className="pb-4 font-medium text-right">Value</th>
                    <th className="pb-4 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bookings?.map((booking) => (
                    <tr key={booking.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-4">
                        <div className="font-mono mb-1">RM-{booking.id.toString().padStart(4, "0")}</div>
                        <div className="text-muted-foreground text-xs flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(booking.pickupAt), "MMM d, HH:mm")}
                        </div>
                      </td>
                      <td className="py-4 text-muted-foreground">{booking.passengerName}</td>
                      <td className="py-4 text-muted-foreground text-xs max-w-[200px] truncate" title={`${booking.pickupAddress} → ${booking.dropoffAddress}`}>
                        {booking.pickupAddress.split(",")[0]}
                        <br />
                        <span className="opacity-50">to</span> {booking.dropoffAddress.split(",")[0]}
                      </td>
                      <td className="py-4 text-muted-foreground capitalize">{booking.vehicleClass.replace("_", " ")}</td>
                      <td className="py-4 text-right font-mono">${booking.priceQuoted}</td>
                      <td className="py-4 text-right">
                        <span className={`inline-block px-3 py-1 text-xs uppercase tracking-widest border ${STATUS_COLORS[booking.status]}`}>
                          {booking.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(!bookings || bookings.length === 0) && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">No recent bookings found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </PortalLayout>
  );
}

export default function Admin() {
  return (
    <AuthGuard requiredRole="admin">
      <AdminInner />
    </AuthGuard>
  );
}
