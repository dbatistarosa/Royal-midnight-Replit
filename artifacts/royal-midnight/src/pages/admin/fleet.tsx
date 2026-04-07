import { useListVehicles } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings } from "lucide-react";

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

export default function AdminFleet() {
  const { data: vehicles, isLoading } = useListVehicles();

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <h1 className="font-serif text-2xl sm:text-3xl mb-6 sm:mb-8">Fleet Management</h1>
      
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">Loading fleet...</div>
        ) : vehicles?.map((vehicle) => (
          <div key={vehicle.id} className="bg-card border border-border rounded-lg p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-serif text-xl">{vehicle.make} {vehicle.model}</h3>
                <p className="text-muted-foreground text-sm">{vehicle.year} • {vehicle.color}</p>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs border ${vehicle.isAvailable ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                {vehicle.isAvailable ? 'Available' : 'Unavailable'}
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Class:</span>
                <span className="capitalize">{vehicle.vehicleClass.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plate:</span>
                <span className="font-mono">{vehicle.plate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Capacity:</span>
                <span>{vehicle.capacity}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </PortalLayout>
  );
}
