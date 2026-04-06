import { useListDrivers } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart } from "lucide-react";

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

export default function AdminDrivers() {
  const { data: drivers, isLoading } = useListDrivers();

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <h1 className="font-serif text-3xl mb-8">Drivers</h1>
      
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-background/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium text-muted-foreground">ID</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Name</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Status</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Online</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Rating</th>
                <th className="px-6 py-4 font-medium text-muted-foreground">Total Rides</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Loading drivers...</td>
                </tr>
              ) : drivers?.map((driver) => (
                <tr key={driver.id} className="hover:bg-background/50">
                  <td className="px-6 py-4 font-medium">#{driver.id}</td>
                  <td className="px-6 py-4">{driver.name}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs capitalize">
                      {driver.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {driver.isOnline ? (
                      <span className="text-green-500">Online</span>
                    ) : (
                      <span className="text-muted-foreground">Offline</span>
                    )}
                  </td>
                  <td className="px-6 py-4">{driver.rating?.toFixed(2) || 'N/A'}</td>
                  <td className="px-6 py-4">{driver.totalRides}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  );
}
