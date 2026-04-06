import { useListBookings } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, History, DollarSign, User, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useDriverStatus } from "@/contexts/driverStatus";
const driverNavItems = [
  { label: "Dashboard", href: "/driver/dashboard", icon: LayoutDashboard },
  { label: "History", href: "/driver/history", icon: History },
  { label: "Earnings", href: "/driver/earnings", icon: DollarSign },
  { label: "Profile", href: "/driver/profile", icon: User },
];

function ApprovedDashboard({ driverId }: { driverId: number }) {
  const { data: bookings, isLoading } = useListBookings({ driverId });
  const activeBookings = bookings?.filter(b => ['confirmed', 'in_progress'].includes(b.status)) || [];

  return (
    <>
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-muted-foreground text-sm font-medium mb-2">Today's Earnings</h3>
          <div className="text-3xl font-serif text-foreground">—</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-muted-foreground text-sm font-medium mb-2">Trips Completed</h3>
          <div className="text-3xl font-serif text-foreground">0</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-muted-foreground text-sm font-medium mb-2">Rating</h3>
          <div className="text-3xl font-serif text-primary">—</div>
        </div>
      </div>

      <h2 className="font-serif text-2xl mb-6">Active & Upcoming Trips</h2>
      {isLoading ? (
        <div className="h-32 bg-card/50 rounded-lg animate-pulse border border-border" />
      ) : activeBookings.length > 0 ? (
        <div className="space-y-4">
          {activeBookings.map((booking) => (
            <div key={booking.id} className="bg-card border border-border rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-sm text-primary font-medium mb-1">#{booking.id}</div>
                  <div className="font-medium">{booking.passengerName}</div>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 capitalize">{booking.status}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {booking.pickupAddress} → {booking.dropoffAddress}
              </div>
              {booking.pickupAt && (
                <div className="text-xs text-muted-foreground mt-1">
                  {format(new Date(booking.pickupAt as unknown as string), "MMM d, yyyy 'at' h:mm a")}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground text-sm">
          No active trips at this time.
        </div>
      )}
    </>
  );
}

export default function DriverDashboard() {
  const { driverRecord, isLoading } = useDriverStatus();

  if (isLoading) {
    return (
      <PortalLayout title="Driver Portal" navItems={driverNavItems}>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Driver Portal" navItems={driverNavItems}>
      <div className="flex justify-between items-center mb-8">
        <h1 className="font-serif text-3xl">Driver Dashboard</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Status:</span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-sm font-medium border border-green-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            Active
          </span>
        </div>
      </div>
      {driverRecord && <ApprovedDashboard driverId={driverRecord.id} />}
    </PortalLayout>
  );
}
