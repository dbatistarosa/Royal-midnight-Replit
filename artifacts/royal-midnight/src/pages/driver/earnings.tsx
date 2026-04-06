import { useGetDriverEarnings } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, History, DollarSign, User } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const driverNavItems = [
  { label: "Dashboard", href: "/driver/dashboard", icon: LayoutDashboard },
  { label: "History", href: "/driver/history", icon: History },
  { label: "Earnings", href: "/driver/earnings", icon: DollarSign },
  { label: "Profile", href: "/driver/profile", icon: User },
];

export default function DriverEarnings() {
  const driverId = 1; // Mock session
  const { data: earnings, isLoading } = useGetDriverEarnings(driverId, { query: { enabled: true, queryKey: ["driverEarnings", driverId] } });

  return (
    <PortalLayout title="Driver Portal" navItems={driverNavItems}>
      <h1 className="font-serif text-3xl mb-8">Earnings</h1>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading earnings...</div>
      ) : (
        <div className="space-y-8">
          <div className="grid md:grid-cols-4 gap-6">
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-muted-foreground text-sm font-medium mb-2">Today</h3>
              <div className="text-3xl font-serif text-primary">${earnings?.today || 0}</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-muted-foreground text-sm font-medium mb-2">This Week</h3>
              <div className="text-3xl font-serif text-foreground">${earnings?.thisWeek || 0}</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-muted-foreground text-sm font-medium mb-2">This Month</h3>
              <div className="text-3xl font-serif text-foreground">${earnings?.thisMonth || 0}</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-muted-foreground text-sm font-medium mb-2">Avg / Ride</h3>
              <div className="text-3xl font-serif text-foreground">${earnings?.avgPerRide || 0}</div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="font-serif text-xl mb-6">Recent Payouts</h2>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={earnings?.recentPayouts || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
