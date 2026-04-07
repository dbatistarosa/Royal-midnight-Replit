import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
import { Link } from "wouter";
import { format } from "date-fns";
import { Loader2, LayoutDashboard, Car, User, BookOpen, Plus, Calendar, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STATUS_COLORS } from "@/lib/constants";

const corporateNavItems = [
  { label: "Dashboard", href: "/corporate/dashboard", icon: LayoutDashboard },
  { label: "Book a Trip", href: "/corporate/book", icon: Plus },
  { label: "All Bookings", href: "/corporate/bookings", icon: BookOpen },
  { label: "Profile", href: "/corporate/profile", icon: User },
];

type Booking = {
  id: number;
  passengerName: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string;
  status: string;
  vehicleClass: string;
  priceQuoted: number;
};

function CorporateDashboardInner() {
  const { user, token } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/bookings`, { headers: authHeader })
      .then(r => r.ok ? r.json() as Promise<Booking[]> : Promise.reject())
      .then(data => setBookings(data))
      .catch(() => setBookings([]))
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const upcoming = bookings.filter(b => b.status !== "cancelled" && b.status !== "completed");
  const [companyName, contactName] = (user?.name ?? "").split(" — ");

  return (
    <PortalLayout title="Corporate Portal" navItems={corporateNavItems}>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-8 gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-primary mb-1">Corporate Account</p>
          <h1 className="font-serif text-2xl sm:text-3xl mb-1">{companyName || user?.name}</h1>
          {contactName && <p className="text-muted-foreground text-sm">Contact: {contactName}</p>}
        </div>
        <Link href="/corporate/book">
          <Button className="bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest text-xs px-6 min-h-[44px]">
            <Plus className="w-4 h-4 mr-2" /> Book a Trip
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-10">
        <div className="bg-card border border-border p-6 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-widest mb-1">Total Bookings</p>
            <p className="text-3xl font-serif">{bookings.length}</p>
          </div>
        </div>

        <div className="bg-card border border-border p-6 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Car className="w-5 h-5 text-primary" />
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-widest mb-1">Upcoming Trips</p>
            <p className="text-3xl font-serif">{upcoming.length}</p>
          </div>
        </div>

        <div className="bg-card border border-border p-6 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-widest mb-1">Completed Trips</p>
            <p className="text-3xl font-serif">{bookings.filter(b => b.status === "completed").length}</p>
          </div>
        </div>
      </div>

      <div className="mb-6 flex justify-between items-center">
        <h2 className="font-serif text-xl">Upcoming Trips</h2>
        <Link href="/corporate/bookings" className="text-xs text-primary hover:text-primary/80 uppercase tracking-widest">
          View all
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : upcoming.length === 0 ? (
        <div className="bg-card border border-border p-10 text-center">
          <Car className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-40" />
          <p className="text-muted-foreground text-sm mb-4">No upcoming trips scheduled.</p>
          <Link href="/corporate/book">
            <Button className="bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest text-xs px-6 min-h-[44px]">
              Schedule a Trip
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {upcoming.slice(0, 5).map(b => (
            <div key={b.id} className="bg-card border border-border p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-mono text-muted-foreground">RM-{String(b.id).padStart(6, "0")}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[b.status] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20"}`}>
                    {b.status.replace("_", " ").toUpperCase()}
                  </span>
                </div>
                <p className="font-medium text-sm mb-1">{b.passengerName}</p>
                <p className="text-muted-foreground text-xs truncate">{b.pickupAddress} → {b.dropoffAddress}</p>
              </div>
              <div className="sm:text-right shrink-0">
                <p className="text-xs text-muted-foreground">{format(new Date(b.pickupAt), "MMM d, yyyy")}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(b.pickupAt), "h:mm a")}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </PortalLayout>
  );
}

export default function CorporateDashboard() {
  return (
    <AuthGuard requiredRole="corporate">
      <CorporateDashboardInner />
    </AuthGuard>
  );
}
