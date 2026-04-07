import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { LayoutDashboard, Car, MapPin, User, MessageSquare, Download, Calendar as CalendarIcon, CreditCard, ChevronLeft, Loader2 } from "lucide-react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";

const passengerNavItems = [
  { label: "Dashboard", href: "/passenger/dashboard", icon: LayoutDashboard },
  { label: "My Rides", href: "/passenger/rides", icon: Car },
  { label: "Saved Addresses", href: "/passenger/addresses", icon: MapPin },
  { label: "Profile", href: "/passenger/profile", icon: User },
  { label: "Support", href: "/passenger/support", icon: MessageSquare },
];

type BookingDetail = {
  id: number;
  status: string;
  passengerName: string;
  passengerEmail?: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string;
  vehicleClass?: string | null;
  passengers?: number | null;
  luggageCount?: number | null;
  flightNumber?: string | null;
  specialRequests?: string | null;
  priceQuoted?: number | null;
  discountAmount?: number | null;
  driverId?: number | null;
};

function PassengerRideDetailInner() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const { token } = useAuth();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id || !token) return;
    setIsLoading(true);
    fetch(`${API_BASE}/bookings/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        if (!r.ok) throw new Error("Not found");
        return r.json() as Promise<BookingDetail>;
      })
      .then(data => setBooking(data))
      .catch(() => setBooking(null))
      .finally(() => setIsLoading(false));
  }, [id, token]);

  const statusLabel = booking?.status?.replace(/_/g, " ") ?? "";
  const statusColor =
    booking?.status === "awaiting_payment" ? "border-amber-500/40 bg-amber-500/10 text-amber-400" :
    booking?.status === "pending" ? "border-blue-500/40 bg-blue-500/10 text-blue-400" :
    booking?.status === "confirmed" ? "border-primary/30 bg-primary/10 text-primary" :
    booking?.status === "in_progress" ? "border-green-500/40 bg-green-500/10 text-green-400" :
    booking?.status === "completed" ? "border-white/20 bg-white/5 text-muted-foreground" :
    "border-red-500/40 bg-red-500/10 text-red-400";

  return (
    <PortalLayout title="Passenger Portal" navItems={passengerNavItems}>
      <div className="mb-6">
        <Link href="/passenger/rides" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Rides
        </Link>
        <div className="flex flex-wrap justify-between items-start gap-3">
          <h1 className="font-serif text-2xl sm:text-3xl">Ride #{id}</h1>
          {booking && (
            <span className={`px-3 py-1 border text-xs uppercase tracking-widest ${statusColor}`}>
              {statusLabel}
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : booking ? (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-5">
            {/* Trip Details */}
            <div className="bg-card border border-border p-5 sm:p-6">
              <h2 className="font-serif text-xl mb-6">Trip Details</h2>
              <div className="space-y-5 relative before:absolute before:left-[1.1rem] before:top-4 before:bottom-4 before:w-px before:bg-border">
                <div className="relative flex items-start gap-4">
                  <div className="bg-primary w-4 h-4 rounded-full relative z-10 mt-1 flex-shrink-0 ring-2 ring-primary/20" />
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      <CalendarIcon className="w-3 h-3 inline mr-1" />
                      {format(new Date(booking.pickupAt), "MMM d, yyyy 'at' h:mm a")}
                    </div>
                    <div className="font-medium">{booking.pickupAddress}</div>
                  </div>
                </div>
                <div className="relative flex items-start gap-4">
                  <div className="bg-muted-foreground w-4 h-4 rounded-full relative z-10 mt-1 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Drop-off</div>
                    <div className="font-medium">{booking.dropoffAddress}</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-border grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                {booking.vehicleClass && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Vehicle</p>
                    <p className="capitalize">{booking.vehicleClass.replace("_", " ")}</p>
                  </div>
                )}
                {booking.passengers != null && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Passengers</p>
                    <p>{booking.passengers}</p>
                  </div>
                )}
                {booking.luggageCount != null && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Luggage</p>
                    <p>{booking.luggageCount} {booking.luggageCount === 1 ? "bag" : "bags"}</p>
                  </div>
                )}
                {booking.flightNumber && (
                  <div className="col-span-2 sm:col-span-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Flight</p>
                    <p>{booking.flightNumber}</p>
                  </div>
                )}
                {booking.specialRequests && (
                  <div className="col-span-2 sm:col-span-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Special Requests</p>
                    <p className="text-muted-foreground">{booking.specialRequests}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Awaiting Payment notice */}
            {booking.status === "awaiting_payment" && (
              <div className="border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-400">
                <p className="font-medium mb-1">Payment Pending</p>
                <p className="text-amber-400/70">Your reservation is confirmed but awaiting payment. Our team will be in touch to complete the process.</p>
              </div>
            )}
          </div>

          <div className="space-y-5">
            {/* Receipt */}
            {booking.priceQuoted != null && (
              <div className="bg-card border border-border p-5 sm:p-6">
                <h2 className="font-serif text-xl mb-5 flex items-center justify-between">
                  <span>Receipt</span>
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                </h2>
                <div className="space-y-3 text-sm mb-5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base Fare</span>
                    <span>${(booking.priceQuoted * 0.8).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Taxes & Fees</span>
                    <span>${(booking.priceQuoted * 0.2).toFixed(2)}</span>
                  </div>
                  {booking.discountAmount != null && booking.discountAmount > 0 && (
                    <div className="flex justify-between text-green-400">
                      <span>Discount</span>
                      <span>-${booking.discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-medium text-base pt-3 border-t border-border">
                    <span>Total</span>
                    <span className="text-primary">${booking.priceQuoted.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-background p-3">
                  <Download className="w-3.5 h-3.5" />
                  <span>Billed via {booking.status === "awaiting_payment" ? "pending payment" : "card on file"}</span>
                </div>
              </div>
            )}

            {/* Need Help */}
            <div className="bg-card border border-border p-5 sm:p-6">
              <h2 className="font-serif text-lg mb-3">Need Help?</h2>
              <p className="text-sm text-muted-foreground mb-4">Contact our concierge team for any assistance with this ride.</p>
              <Link href="/passenger/support" className="text-primary text-sm font-medium hover:underline">
                Report an Issue →
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-muted-foreground mb-4">We couldn't find this ride. It may belong to a different account.</p>
          <Link href="/passenger/rides" className="text-primary text-sm hover:underline">
            ← Back to My Rides
          </Link>
        </div>
      )}
    </PortalLayout>
  );
}

export default function PassengerRideDetail() {
  return (
    <AuthGuard requiredRole="passenger">
      <PassengerRideDetailInner />
    </AuthGuard>
  );
}
