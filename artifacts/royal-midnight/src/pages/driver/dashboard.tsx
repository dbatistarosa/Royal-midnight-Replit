import { useListBookings } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, History, DollarSign, User, CalendarRange } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

const driverNavItems = [
  { label: "Dashboard", href: "/driver/dashboard", icon: LayoutDashboard },
  { label: "History", href: "/driver/history", icon: History },
  { label: "Earnings", href: "/driver/earnings", icon: DollarSign },
  { label: "Profile", href: "/driver/profile", icon: User },
];

export default function DriverDashboard() {
  const driverId = 1; // Mock session
  const { data: bookings, isLoading } = useListBookings({ driverId }, { query: { enabled: true } });

  const activeBookings = bookings?.filter(b => ['confirmed', 'in_progress'].includes(b.status)) || [];

  return (
    <PortalLayout title="Driver Portal" navItems={driverNavItems}>
      <div className="flex justify-between items-center mb-8">
        <h1 className="font-serif text-3xl">Driver Dashboard</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Status:</span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-sm font-medium border border-green-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            Online
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-muted-foreground text-sm font-medium mb-2">Today's Earnings</h3>
          <div className="text-3xl font-serif text-foreground">$450.00</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-muted-foreground text-sm font-medium mb-2">Trips Completed</h3>
          <div className="text-3xl font-serif text-foreground">3</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-muted-foreground text-sm font-medium mb-2">Rating</h3>
          <div className="text-3xl font-serif text-primary">4.98</div>
        </div>
      </div>

      <h2 className="font-serif text-2xl mb-6">Active & Upcoming Trips</h2>
      
      {isLoading ? (
        <div className="space-y-4">
          <div className="h-32 bg-card/50 rounded-lg animate-pulse border border-border"></div>
        </div>
      ) : activeBookings.length > 0 ? (
        <div className="space-y-4">
          {activeBookings.map((booking) => (
            <div key={booking.id} className="bg-card border border-border rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-sm text-primary font-medium mb-1">
                    {format(new Date(booking.pickupAt), "PPP 'at' p")}
                  </div>
                  <div className="font-medium text-lg">Passenger: {booking.passengerName}</div>
                </div>
                <div className="text-sm px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {booking.status.toUpperCase()}
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4 text-sm bg-background/50 rounded p-4">
                <div>
                  <div className="text-muted-foreground mb-1">Pickup</div>
                  <div className="font-medium">{booking.pickupAddress}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Dropoff</div>
                  <div className="font-medium">{booking.dropoffAddress}</div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border flex gap-4">
                <button className="flex-1 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90">
                  {booking.status === 'confirmed' ? "Start Trip" : "Complete Trip"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          <CalendarRange className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <p>No active assignments at the moment.</p>
        </div>
      )}
    </PortalLayout>
  );
}
