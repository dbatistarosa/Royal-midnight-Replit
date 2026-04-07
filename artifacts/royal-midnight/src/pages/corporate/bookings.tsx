import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
import { format } from "date-fns";
import { Loader2, LayoutDashboard, Plus, BookOpen, User, Car } from "lucide-react";
import { Link } from "wouter";
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
  paymentType?: string | null;
};

const CLASS_LABELS: Record<string, string> = {
  business: "Business Sedan",
  suv: "Premium SUV",
  standard: "Standard",
};

function CorporateBookingsInner() {
  const { token } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "upcoming" | "completed">("all");

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

  const filtered = bookings.filter(b => {
    if (filter === "upcoming") return b.status !== "cancelled" && b.status !== "completed";
    if (filter === "completed") return b.status === "completed";
    return true;
  });

  return (
    <PortalLayout title="Corporate Portal" navItems={corporateNavItems}>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-8 gap-3">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl mb-1">All Bookings</h1>
          <p className="text-muted-foreground text-sm">All trips booked on your corporate account.</p>
        </div>
        <Link href="/corporate/book">
          <Button className="bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-widest text-xs px-6 min-h-[44px]">
            <Plus className="w-4 h-4 mr-2" /> Book a Trip
          </Button>
        </Link>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {(["all", "upcoming", "completed"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-xs uppercase tracking-widest border transition-colors whitespace-nowrap min-h-[36px] ${
              filter === f
                ? "border-primary text-primary bg-primary/5"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border p-10 text-center">
          <Car className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-40" />
          <p className="text-muted-foreground text-sm">No bookings found.</p>
        </div>
      ) : (
        <div className="bg-card border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[560px]">
              <thead className="bg-background/50 border-b border-border">
                <tr>
                  <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Ref</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Passenger</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Pickup</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Date</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Class</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(b => (
                  <tr key={b.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-5 py-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      RM-{String(b.id).padStart(6, "0")}
                    </td>
                    <td className="px-5 py-4 font-medium whitespace-nowrap">{b.passengerName}</td>
                    <td className="px-5 py-4 text-muted-foreground max-w-[180px] truncate">{b.pickupAddress}</td>
                    <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">
                      {format(new Date(b.pickupAt), "MMM d, yyyy h:mm a")}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">
                      {CLASS_LABELS[b.vehicleClass] ?? b.vehicleClass}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[b.status] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20"}`}>
                        {b.status.replace("_", " ").toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}

export default function CorporateBookings() {
  return (
    <AuthGuard requiredRole="corporate">
      <CorporateBookingsInner />
    </AuthGuard>
  );
}
