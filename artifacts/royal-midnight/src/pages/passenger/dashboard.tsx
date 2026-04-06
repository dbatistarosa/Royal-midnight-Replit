import { useGetUserBookings } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Car, MapPin, User, MessageSquare, Plus } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

const passengerNavItems = [
  { label: "Dashboard", href: "/passenger/dashboard", icon: LayoutDashboard },
  { label: "My Rides", href: "/passenger/rides", icon: Car },
  { label: "Saved Addresses", href: "/passenger/addresses", icon: MapPin },
  { label: "Profile", href: "/passenger/profile", icon: User },
  { label: "Support", href: "/passenger/support", icon: MessageSquare },
];

export default function PassengerDashboard() {
  const userId = 1; // Mock session
  const { data: bookings, isLoading } = useGetUserBookings(userId, { query: { enabled: true } });

  const upcomingBookings = bookings?.filter(b => ['pending', 'confirmed'].includes(b.status)) || [];

  return (
    <PortalLayout title="Passenger Portal" navItems={passengerNavItems}>
      <div className="flex justify-between items-center mb-8">
        <h1 className="font-serif text-3xl">Welcome Back, James</h1>
        <Link 
          href="/book" 
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Book a Ride
        </Link>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-muted-foreground text-sm font-medium mb-2">Total Rides</h3>
          <div className="text-3xl font-serif text-foreground">{bookings?.length || 0}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-muted-foreground text-sm font-medium mb-2">Upcoming Rides</h3>
          <div className="text-3xl font-serif text-foreground">{upcomingBookings.length}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-muted-foreground text-sm font-medium mb-2">Loyalty Status</h3>
          <div className="text-3xl font-serif text-primary">Gold</div>
        </div>
      </div>

      <h2 className="font-serif text-2xl mb-6">Upcoming Rides</h2>
      
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="h-32 bg-card/50 rounded-lg animate-pulse border border-border"></div>
          ))}
        </div>
      ) : upcomingBookings.length > 0 ? (
        <div className="space-y-4">
          {upcomingBookings.map((booking) => (
            <div key={booking.id} className="bg-card border border-border rounded-lg p-6 flex items-center justify-between">
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
              <div className="text-right">
                <div className="text-sm px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 inline-block mb-3">
                  {booking.status.toUpperCase()}
                </div>
                <div>
                  <Link href={`/passenger/rides/${booking.id}`} className="text-sm text-primary hover:underline">
                    View Details
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          <p>No upcoming rides scheduled.</p>
        </div>
      )}
    </PortalLayout>
  );
}
