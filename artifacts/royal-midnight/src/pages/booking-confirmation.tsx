import { useState, useEffect, useRef } from "react";
import { useRoute, Link } from "wouter";
import { API_BASE } from "@/lib/constants";
import { useAuth } from "@/contexts/auth";
import { format } from "date-fns";
import { CheckCircle2, Loader2, Calendar, MapPin, User, Mail, CreditCard, Car, Users, Plane, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

type PublicBooking = {
  id: number;
  status: string;
  passengerName: string;
  passengerEmail?: string;
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
  promoCode?: string | null;
  paymentType?: string | null;
};

async function fetchBooking(id: number): Promise<PublicBooking> {
  const res = await fetch(`${API_BASE}/bookings/${id}/track`);
  if (!res.ok) throw new Error("Not found");
  return res.json() as Promise<PublicBooking>;
}

export default function BookingConfirmation() {
  const [, params] = useRoute("/booking-confirmation/:id");
  const id = params?.id ? parseInt(params.id) : 0;
  const { user } = useAuth();
  const viewBookingsHref = user?.role === "admin"
    ? "/admin/bookings"
    : user?.role === "driver"
    ? "/driver/dashboard"
    : "/passenger/rides";

  const [booking, setBooking] = useState<PublicBooking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [paymentConfirming, setPaymentConfirming] = useState(false);
  const confirmed3DS = useRef(false);
  // Track polling attempts so we stop after a few tries
  const pollCount = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle 3DS redirect return: Stripe sends payment_intent + redirect_status in the URL.
  // Call /payments/confirm so the booking status is updated even when the webhook is slow.
  useEffect(() => {
    if (!id || confirmed3DS.current) return;
    const urlParams = new URLSearchParams(window.location.search);
    const pi = urlParams.get("payment_intent");
    const redirectStatus = urlParams.get("redirect_status");

    if (!pi || !["succeeded", "requires_capture"].includes(redirectStatus ?? "")) return;

    confirmed3DS.current = true;
    // Remove params from URL so a page refresh doesn't reprocess
    window.history.replaceState({}, "", window.location.pathname);

    setPaymentConfirming(true);
    fetch(`${API_BASE}/payments/confirm/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentIntentId: pi }),
    })
      .catch(() => {})
      .finally(() => setPaymentConfirming(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    // Small delay when coming back from 3DS so the confirm call above has time to settle
    const delay = confirmed3DS.current ? 800 : 0;
    const t = setTimeout(() => {
      setIsLoading(true);
      fetchBooking(id)
        .then(data => { setBooking(data); setError(false); })
        .catch(() => setError(true))
        .finally(() => setIsLoading(false));
    }, delay);
    return () => clearTimeout(t);
  }, [id, paymentConfirming]);

  // If booking is loaded and still awaiting_payment, poll for webhook confirmation.
  // The direct /payments/confirm call above is the fast path; this is the safety net.
  useEffect(() => {
    if (!booking || booking.status !== "awaiting_payment") return;
    if (pollCount.current >= 6) return; // max ~12 seconds of polling

    pollTimer.current = setTimeout(() => {
      pollCount.current += 1;
      fetchBooking(id)
        .then(data => { setBooking(data); })
        .catch(() => {});
    }, 2000);

    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [booking, id]);

  if (isLoading || paymentConfirming) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-3xl font-serif text-white mb-4">Booking Not Found</h1>
        <p className="text-gray-400 mb-8">We couldn't locate this reservation. It may still be processing.</p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Link href={viewBookingsHref}>
            <Button className="bg-primary text-black rounded-none uppercase tracking-widest text-xs">View My Bookings</Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="border-white/20 text-white hover:bg-white hover:text-black rounded-none uppercase tracking-widest text-xs">Return Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const isCancelled = booking.status === "cancelled";
  const isPaid = ["pending", "confirmed", "on_way", "on_location", "in_progress", "completed", "authorized"].includes(booking.status);

  return (
    <div className="min-h-screen bg-[#050505] pt-32 pb-24">
      <div className="container mx-auto px-6 max-w-3xl">
        <div className="bg-black border border-white/10 p-8 md:p-16 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />

          {isCancelled ? (
            <>
              <div className="w-20 h-20 mx-auto mb-8 flex items-center justify-center border border-red-900/30 bg-red-900/10">
                <span className="text-4xl text-red-500">✕</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-serif text-white mb-2">Booking Cancelled</h1>
              <p className="text-gray-400 text-base mb-8">This reservation has been cancelled. Please contact us if you have any questions.</p>
              <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
                <Link href="/book">
                  <Button className="w-full sm:w-auto bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-xs px-8 py-6 rounded-none">
                    Book Again
                  </Button>
                </Link>
                <Link href="/">
                  <Button variant="outline" className="w-full sm:w-auto border-white/20 text-white hover:bg-white hover:text-black font-medium uppercase tracking-widest text-xs px-8 py-6 rounded-none">
                    Return Home
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-20 h-20 text-primary mx-auto mb-8" />
              <h1 className="text-2xl sm:text-4xl font-serif text-white mb-2">Reservation Confirmed</h1>
              <p className="text-gray-400 text-base mb-6">Thank you for choosing Royal Midnight. Your vehicle has been reserved.</p>

              {isPaid ? (
                <div className="bg-green-500/5 border border-green-500/20 p-5 flex gap-4 items-start text-left mb-8 max-w-lg mx-auto">
                  <CreditCard className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-white font-medium mb-1">Payment Received</p>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Your payment has been processed. A confirmation has been sent to{" "}
                      <span className="text-white">{booking.passengerEmail || "your email"}</span>.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-primary/5 border border-primary/20 p-5 flex gap-4 items-start text-left mb-8 max-w-lg mx-auto">
                  <Mail className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-white font-medium mb-1">Invoice Coming Your Way</p>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Our team will review your booking and send a payment invoice to{" "}
                      <span className="text-white">{booking.passengerEmail || "your email"}</span>.
                      No payment is required at this time.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {!isCancelled && (
            <>
              <div className="inline-block bg-white/5 border border-white/10 px-8 py-4 mb-10">
                <span className="block text-xs uppercase tracking-widest text-gray-500 mb-1">Reference Number</span>
                <span className="text-2xl font-mono text-primary tracking-widest">RM-{booking.id.toString().padStart(6, "0")}</span>
              </div>

              {/* Itinerary */}
              <div className="text-left bg-white/5 border border-white/8 p-6 sm:p-8 mb-4 space-y-5">
                <p className="text-[10px] uppercase tracking-[0.3em] text-primary mb-4">Itinerary</p>
                <div className="space-y-4 text-sm">
                  <div className="flex gap-3">
                    <Calendar className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-gray-500 uppercase tracking-widest text-xs mb-0.5">Date &amp; Time</p>
                      <p className="text-white">{format(new Date(booking.pickupAt), "EEEE, MMMM d, yyyy 'at' h:mm a")}</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-gray-500 uppercase tracking-widest text-xs mb-0.5">Pick-up</p>
                      <p className="text-white">{booking.pickupAddress}</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <MapPin className="w-4 h-4 text-primary/40 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-gray-500 uppercase tracking-widest text-xs mb-0.5">Drop-off</p>
                      <p className="text-white">{booking.dropoffAddress}</p>
                    </div>
                  </div>
                  {booking.flightNumber && (
                    <div className="flex gap-3">
                      <Plane className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-gray-500 uppercase tracking-widest text-xs mb-0.5">Flight</p>
                        <p className="text-white">{booking.flightNumber}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Vehicle & Passengers */}
              <div className="text-left bg-white/5 border border-white/8 p-6 sm:p-8 mb-4">
                <p className="text-[10px] uppercase tracking-[0.3em] text-primary mb-4">Vehicle &amp; Passengers</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {booking.vehicleClass && (
                    <div className="flex gap-3">
                      <Car className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-gray-500 uppercase tracking-widest text-xs mb-0.5">Vehicle</p>
                        <p className="text-white capitalize">
                          {booking.vehicleClass === "business" ? "Business Class Sedan" : booking.vehicleClass === "suv" ? "Premium SUV" : booking.vehicleClass}
                        </p>
                      </div>
                    </div>
                  )}
                  {booking.passengers != null && (
                    <div className="flex gap-3">
                      <Users className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-gray-500 uppercase tracking-widest text-xs mb-0.5">Passengers</p>
                        <p className="text-white">{booking.passengers}</p>
                      </div>
                    </div>
                  )}
                  {booking.passengerName && (
                    <div className="flex gap-3 col-span-2">
                      <User className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-gray-500 uppercase tracking-widest text-xs mb-0.5">Passenger</p>
                        <p className="text-white">{booking.passengerName}</p>
                      </div>
                    </div>
                  )}
                  {booking.specialRequests && (
                    <div className="flex gap-3 col-span-2">
                      <MessageSquare className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-gray-500 uppercase tracking-widest text-xs mb-0.5">Special Requests</p>
                        <p className="text-white">{booking.specialRequests}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Summary */}
              {booking.priceQuoted != null && (
                <div className="text-left bg-white/5 border border-primary/20 p-6 sm:p-8 mb-8">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-primary mb-4">Payment Summary</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-400">
                      <span>Subtotal</span>
                      <span>${(booking.priceQuoted + (booking.discountAmount ?? 0)).toFixed(2)}</span>
                    </div>
                    {booking.discountAmount != null && booking.discountAmount > 0 && (
                      <div className="flex justify-between text-green-400">
                        <span>Promo {booking.promoCode ? `(${booking.promoCode})` : "Discount"}</span>
                        <span>−${booking.discountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-white/10">
                      <span className="text-white font-semibold">Total {isPaid ? "Charged" : "Due"}</span>
                      <span className="text-primary font-bold text-lg">${booking.priceQuoted.toFixed(2)}</span>
                    </div>
                    {isPaid && (
                      <div className="flex items-center gap-2 mt-2 text-green-400 text-xs">
                        <CreditCard className="w-3 h-3" />
                        <span>Payment received — receipt sent to {booking.passengerEmail || "your email"}</span>
                      </div>
                    )}
                    {!isPaid && (
                      <p className="text-xs text-gray-600 mt-1">Invoice will be sent to {booking.passengerEmail || "your email"}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link href="/passenger/rides">
                  <Button className="w-full sm:w-auto bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-xs px-8 py-6 rounded-none">
                    View My Bookings
                  </Button>
                </Link>
                <Link href="/">
                  <Button variant="outline" className="w-full sm:w-auto border-white/20 text-white hover:bg-white hover:text-black font-medium uppercase tracking-widest text-xs px-8 py-6 rounded-none">
                    Return Home
                  </Button>
                </Link>
              </div>
            </>
          )}

          {isCancelled && (
            <div className="inline-block bg-white/5 border border-white/10 px-8 py-4">
              <span className="block text-xs uppercase tracking-widest text-gray-500 mb-1">Reference Number</span>
              <span className="text-2xl font-mono text-white/40 tracking-widest">RM-{booking.id.toString().padStart(6, "0")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
