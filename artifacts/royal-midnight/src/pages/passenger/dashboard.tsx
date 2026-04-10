import { useGetUserBookings } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAuth } from "@/contexts/auth";
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

function PassengerDashboardInner() {
  const { user } = useAuth();
  const userId = user?.id;
  const { data: bookings, isLoading } = useGetUserBookings(userId ?? 0, { query: { enabled: userId != null, queryKey: ["userBookings", userId] } });

  const upcomingBookings = bookings?.filter(b => ['pending', 'confirmed'].includes(b.status)) || [];

  return (
    <PortalLayout title="Passenger Portal" navItems={passengerNavItems}>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 sm:mb-8 gap-3">
        <h1 className="font-serif text-2xl sm:text-3xl">Welcome Back, {user?.name?.split(" ")[0] ?? "Guest"}</h1>
        <Link 
          href="/book" 
          className="inline-flex items-center gap-2 bg-primary text-black px-4 py-2.5 text-xs font-medium hover:bg-primary/90 uppercase tracking-widest self-start sm:self-auto min-h-[44px]"
        >
          <Plus className="h-4 w-4" /> Book a Ride
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
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
            <div key={booking.id} className="bg-card border border-border rounded-lg p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-primary font-medium mb-1">
                  {format(new Date(booking.pickupAt), "PPP 'at' p")}
                </div>
                <div className="font-medium text-base sm:text-lg mb-1 truncate">{booking.pickupAddress}</div>
                <div className="text-muted-foreground text-sm flex items-center gap-2 min-w-0">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground flex-shrink-0"></span>
                  <span className="truncate">{booking.dropoffAddress}</span>
                </div>
              </div>
              <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-2 flex-shrink-0">
                <div className="text-xs px-2 py-1 bg-primary/10 text-primary border border-primary/20 uppercase tracking-widest">
                  {booking.status.toUpperCase()}
                </div>
                <Link href={`/passenger/rides/${booking.id}`} className="text-sm text-primary hover:underline min-h-[44px] flex items-center">
                  View Details
                </Link>
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

export default function PassengerDashboard() {
  return (
    <AuthGuard requiredRole="passenger">
      <PassengerDashboardInner />
    </AuthGuard>
  );
}
