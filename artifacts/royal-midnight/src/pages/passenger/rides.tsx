import { useGetUserBookings } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAuth } from "@/contexts/auth";
import { LayoutDashboard, Car, MapPin, User, MessageSquare } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

const passengerNavItems = [
  { label: "Dashboard", href: "/passenger/dashboard", icon: LayoutDashboard },
  { label: "My Rides", href: "/passenger/rides", icon: Car },
  { label: "Saved Addresses", href: "/passenger/addresses", icon: MapPin },
  { label: "Profile", href: "/passenger/profile", icon: User },
  { label: "Support", href: "/passenger/support", icon: MessageSquare },
];

function PassengerRidesInner() {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const { data: bookings, isLoading } = useGetUserBookings(userId, { query: { enabled: !!userId } });

  const upcomingBookings = bookings?.filter(b => ['pending', 'confirmed'].includes(b.status)) || [];
  const pastBookings = bookings?.filter(b => ['completed', 'cancelled'].includes(b.status)) || [];

  return (
    <PortalLayout title="Passenger Portal" navItems={passengerNavItems}>
      <h1 className="font-serif text-3xl mb-8">My Rides</h1>
      
      <div className="space-y-12">
        <section>
          <h2 className="font-serif text-2xl mb-6">Upcoming Rides</h2>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : upcomingBookings.length > 0 ? (
            <div className="space-y-4">
              {upcomingBookings.map((booking) => (
                <div key={booking.id} className="bg-card border border-border rounded-lg p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <div className="text-sm text-primary font-medium mb-1">
                      {format(new Date(booking.pickupAt), "PPP 'at' p")}
                    </div>
                    <div className="font-medium text-lg mb-1">{booking.pickupAddress}</div>
                    <div className="text-muted-foreground text-sm flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-muted-foreground"></span>
                      {booking.dropoffAddress}
                    </div>
                  </div>
                  <div className="text-right w-full md:w-auto flex md:flex-col justify-between items-center md:items-end">
                    <div className="text-sm px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 mb-3">
                      {booking.status.toUpperCase()}
                    </div>
                    <Link href={`/passenger/rides/${booking.id}`} className="text-sm text-primary hover:underline">
                      View Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
              No upcoming rides. <Link href="/book" className="text-primary hover:underline">Book one now.</Link>
            </div>
          )}
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-6">Past Rides</h2>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : pastBookings.length > 0 ? (
            <div className="space-y-4">
              {pastBookings.map((booking) => (
                <div key={booking.id} className="bg-card border border-border rounded-lg p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 opacity-75 hover:opacity-100 transition-opacity">
                  <div>
                    <div className="text-sm text-muted-foreground font-medium mb-1">
                      {format(new Date(booking.pickupAt), "PPP 'at' p")}
                    </div>
                    <div className="font-medium text-lg mb-1">{booking.pickupAddress}</div>
                    <div className="text-muted-foreground text-sm flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-muted-foreground"></span>
                      {booking.dropoffAddress}
                    </div>
                  </div>
                  <div className="text-right w-full md:w-auto flex md:flex-col justify-between items-center md:items-end">
                    <div className="text-sm px-2 py-1 rounded-full bg-muted/50 text-muted-foreground border border-border mb-3">
                      {booking.status.toUpperCase()}
                    </div>
                    <Link href={`/passenger/rides/${booking.id}`} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                      View Receipt
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
              No past rides.
            </div>
          )}
        </section>
      </div>
    </PortalLayout>
  );
}

export default function PassengerRides() {
  return (
    <AuthGuard requiredRole="passenger">
      <PassengerRidesInner />
    </AuthGuard>
  );
}
