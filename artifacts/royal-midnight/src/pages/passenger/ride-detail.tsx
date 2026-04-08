import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { LayoutDashboard, Car, MapPin, User, MessageSquare, Download, Calendar as CalendarIcon, CreditCard, ChevronLeft, Loader2, AlertTriangle, XCircle, CheckCircle } from "lucide-react";
import { Link, useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

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

type CancelPreview = {
  canCancel: boolean;
  tier: string;
  feePercent: number;
  feeAmount: number;
  netRefund: number;
  hoursUntilPickup: number;
  message: string;
  priceQuoted: number;
};

function PassengerRideDetailInner() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const { token } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cancelPreview, setCancelPreview] = useState<CancelPreview | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelConfirming, setCancelConfirming] = useState(false);

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

  const handleCancelPreview = async () => {
    if (!token) return;
    setCancelLoading(true);
    try {
      const res = await fetch(`${API_BASE}/bookings/${id}/cancel-preview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not load cancellation policy.");
      const data = await res.json() as CancelPreview;
      setCancelPreview(data);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Could not load cancellation policy.", variant: "destructive" });
    } finally {
      setCancelLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!token || !cancelPreview) return;
    setCancelConfirming(true);
    try {
      const res = await fetch(`${API_BASE}/bookings/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Could not cancel booking.");
      }
      toast({ title: "Booking cancelled", description: cancelPreview.feeAmount > 0 ? `A $${cancelPreview.feeAmount.toFixed(2)} cancellation fee applies.` : "Your booking has been cancelled at no charge." });
      setLocation("/passenger/rides");
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Could not cancel booking.", variant: "destructive" });
      setCancelConfirming(false);
    }
  };

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

            {/* Cancel Booking */}
            {booking && !["completed", "cancelled", "in_progress"].includes(booking.status) && (
              <div className="bg-card border border-red-500/20 p-5 sm:p-6">
                <h2 className="font-serif text-lg mb-2 text-red-400">Cancel Booking</h2>
                <p className="text-sm text-muted-foreground mb-4">Need to cancel? Review the cancellation policy before proceeding.</p>
                <Button
                  variant="outline"
                  onClick={() => void handleCancelPreview()}
                  disabled={cancelLoading}
                  className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-none text-xs uppercase tracking-widest"
                >
                  {cancelLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Loading Policy...</> : <><XCircle className="w-3.5 h-3.5 mr-2" />Cancel This Ride</>}
                </Button>
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

      {/* Cancellation policy modal */}
      {cancelPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-card border border-border w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="font-serif text-xl flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" /> Cancel Booking
              </h2>
              <button onClick={() => setCancelPreview(null)} className="text-muted-foreground hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Policy message */}
              <div className={`border p-4 text-sm ${cancelPreview.tier === "free" ? "border-green-500/30 bg-green-500/5 text-green-400" : "border-amber-500/30 bg-amber-500/5 text-amber-400"}`}>
                {cancelPreview.tier === "free"
                  ? <CheckCircle className="w-4 h-4 inline mr-2" />
                  : <AlertTriangle className="w-4 h-4 inline mr-2" />}
                {cancelPreview.message}
              </div>

              {/* Fee breakdown */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Booking Total</span>
                  <span>${cancelPreview.priceQuoted.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className={cancelPreview.feeAmount > 0 ? "text-red-400" : "text-muted-foreground"}>
                    Cancellation Fee {cancelPreview.feePercent > 0 ? `(${cancelPreview.feePercent}%)` : ""}
                  </span>
                  <span className={cancelPreview.feeAmount > 0 ? "text-red-400" : "text-muted-foreground"}>
                    {cancelPreview.feeAmount > 0 ? `$${cancelPreview.feeAmount.toFixed(2)}` : "None"}
                  </span>
                </div>
                <div className="flex justify-between font-medium text-base pt-2 border-t border-border">
                  <span>Refund Amount</span>
                  <span className="text-primary">${cancelPreview.netRefund.toFixed(2)}</span>
                </div>
              </div>

              {cancelPreview.feeAmount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Refunds are processed within 5–10 business days to your original payment method.
                </p>
              )}
            </div>

            <div className="px-6 py-5 border-t border-border flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setCancelPreview(null)}
                disabled={cancelConfirming}
                className="rounded-none border-white/20 text-white hover:bg-white/10 text-xs uppercase tracking-widest"
              >
                Keep Booking
              </Button>
              <Button
                onClick={() => void handleConfirmCancel()}
                disabled={cancelConfirming}
                className="bg-red-600 hover:bg-red-700 text-white rounded-none text-xs uppercase tracking-widest px-6"
              >
                {cancelConfirming ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Cancelling...</> : "Confirm Cancellation"}
              </Button>
            </div>
          </div>
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
