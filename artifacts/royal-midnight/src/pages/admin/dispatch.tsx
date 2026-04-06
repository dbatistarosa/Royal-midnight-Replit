import { useGetDispatchBoard } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart } from "lucide-react";
import { format } from "date-fns";

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

export default function AdminDispatch() {
  const { data: dispatchBoard, isLoading } = useGetDispatchBoard();

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <h1 className="font-serif text-3xl mb-8">Live Dispatch</h1>
      
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading dispatch board...</div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-8">
          <div>
            <h2 className="font-serif text-xl mb-4 text-primary">Active Trips ({dispatchBoard?.activeTrips.length || 0})</h2>
            <div className="space-y-4">
              {dispatchBoard?.activeTrips.map(trip => (
                <div key={trip.id} className="bg-card border border-border p-4 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium">#{trip.id} - {trip.passengerName}</div>
                    <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
                      {trip.status}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div><span className="font-medium text-foreground">From:</span> {trip.pickupAddress}</div>
                    <div><span className="font-medium text-foreground">To:</span> {trip.dropoffAddress}</div>
                    <div className="pt-2 mt-2 border-t border-border">
                      Driver ID: {trip.driverId || 'Unassigned'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div>
            <h2 className="font-serif text-xl mb-4 text-primary">Available Drivers ({dispatchBoard?.availableDrivers.length || 0})</h2>
            <div className="space-y-4">
              {dispatchBoard?.availableDrivers.map(driver => (
                <div key={driver.id} className="bg-card border border-border p-4 rounded-lg flex justify-between items-center">
                  <div>
                    <div className="font-medium">{driver.name}</div>
                    <div className="text-sm text-muted-foreground">{driver.phone}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium mb-1">Rating: {driver.rating?.toFixed(2) || 'N/A'}</div>
                    <span className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-500 border border-green-500/20">
                      Online
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
