import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, History, DollarSign, Star, User, Loader2, BarChart2 } from "lucide-react";
import { format } from "date-fns";
import { useDriverStatus } from "@/contexts/driverStatus";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";

const driverNavItems = [
  { label: "Dashboard", href: "/driver/dashboard", icon: LayoutDashboard },
  { label: "Finished", href: "/driver/history", icon: History },
  { label: "Earnings", href: "/driver/earnings", icon: DollarSign },
  { label: "Stats", href: "/driver/stats", icon: BarChart2 },
  { label: "Profile", href: "/driver/profile", icon: User },
];

type BookingRow = {
  id: number;
  passengerName: string;
  pickupAddress: string;
  dropoffAddress: string;
  status: string;
  pickupAt: string;
  priceQuoted: number;
  tipAmount?: number | null;
  driverEarnings?: number;
};

type TripReview = { bookingId: number; rating: number; comment: string | null };

const STATUS_COLORS: Record<string, string> = {
  completed: "text-green-400 bg-green-400/10 border-green-400/20",
  cancelled: "text-gray-400 bg-gray-400/10 border-gray-400/20",
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star key={s} className={`w-3 h-3 ${s <= rating ? "text-primary fill-primary" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

export default function DriverHistory() {
  const { driverRecord, isLoading: driverLoading } = useDriverStatus();
  const { token } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [reviews, setReviews] = useState<TripReview[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!driverRecord?.id || !token) return;
    setIsLoading(true);
    Promise.all([
      fetch(`${API_BASE}/bookings?driverId=${driverRecord.id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() as Promise<BookingRow[]> : Promise.resolve([]))
        .then(data => Array.isArray(data) ? data : []),
      fetch(`${API_BASE}/reviews?driverId=${driverRecord.id}`)
        .then(r => r.ok ? r.json() as Promise<TripReview[]> : Promise.resolve([]))
        .then(data => Array.isArray(data) ? data : []),
    ])
      .then(([trips, revs]) => { setBookings(trips); setReviews(revs); })
      .catch(() => { setBookings([]); setReviews([]); })
      .finally(() => setIsLoading(false));
  }, [driverRecord?.id, token]);

  const pastBookings = bookings.filter(b => ["completed", "cancelled"].includes(b.status));
  const reviewMap = new Map(reviews.map(r => [r.bookingId, r]));

  return (
    <PortalLayout title="Driver Portal" navItems={driverNavItems}>
      <h1 className="font-serif text-2xl sm:text-3xl mb-6 sm:mb-8">Finished Trips</h1>

      {driverLoading || isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : pastBookings.length > 0 ? (
        <div className="bg-card border border-border rounded-none overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[700px]">
              <thead className="bg-background/50 border-b border-border">
                <tr>
                  <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Date</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Passenger</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Route</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Status</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs text-right">Fare</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs text-right">Tip</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs text-right">Your Share</th>
                  <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pastBookings.map((booking) => {
                  const review = reviewMap.get(booking.id);
                  const tip = booking.tipAmount ?? 0;
                  const isCompleted = booking.status === "completed";
                  return (
                    <tr key={booking.id} className="hover:bg-background/50 transition-colors">
                      <td className="px-5 py-4 whitespace-nowrap text-sm">
                        {format(new Date(booking.pickupAt), "MMM d, HH:mm")}
                      </td>
                      <td className="px-5 py-4">{booking.passengerName}</td>
                      <td className="px-5 py-4 max-w-[160px] truncate text-muted-foreground" title={`${booking.pickupAddress} → ${booking.dropoffAddress}`}>
                        {booking.pickupAddress.split(",")[0]} → {booking.dropoffAddress.split(",")[0]}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2 py-1 border text-xs capitalize ${STATUS_COLORS[booking.status] ?? "text-muted-foreground bg-muted border-transparent"}`}>
                          {booking.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums">
                        {isCompleted ? `$${booking.priceQuoted.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums">
                        {isCompleted && tip > 0
                          ? <span className="text-primary font-medium">+${tip.toFixed(2)}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-5 py-4 text-right font-semibold text-primary tabular-nums">
                        {isCompleted
                          ? `$${((booking.driverEarnings ?? booking.priceQuoted * 0.70) + tip).toFixed(2)}`
                          : <span className="text-muted-foreground font-normal">—</span>}
                      </td>
                      <td className="px-5 py-4">
                        {isCompleted && review
                          ? <StarRating rating={review.rating} />
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-none p-12 text-center text-muted-foreground">
          No trips yet.
        </div>
      )}
    </PortalLayout>
  );
}
