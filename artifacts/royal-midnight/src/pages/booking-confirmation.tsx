import { useState, useEffect, useRef } from "react";
import { useRoute, Link } from "wouter";
import { API_BASE } from "@/lib/constants";
import { format } from "date-fns";
import { CheckCircle2, Clock, Loader2, Calendar, MapPin, User, RefreshCw, CreditCard, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type PublicBooking = {
  id: number;
  status: string;
  passengerName: string;
  passengerEmail?: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string;
  priceQuoted?: number | null;
  discountAmount?: number | null;
  vehicleClass?: string | null;
};

async function fetchBooking(id: number): Promise<PublicBooking> {
  const res = await fetch(`${API_BASE}/bookings/${id}/track`);
  if (!res.ok) throw new Error("Not found");
  return res.json() as Promise<PublicBooking>;
}

const POLL_TIMEOUT_MS = 3 * 60 * 1000;
const RETRY_HINT_MS = 15 * 1000;

export default function BookingConfirmation() {
  const [, params] = useRoute("/booking-confirmation/:id");
  const id = params?.id ? parseInt(params.id) : 0;

  const [booking, setBooking] = useState<PublicBooking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [showRetryButton, setShowRetryButton] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(Date.now());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async (manual = false) => {
    if (!id) return;
    if (manual) setIsRefreshing(true);
    try {
      const data = await fetchBooking(id);
      setBooking(data);
      setError(false);
      if (data.status !== "awaiting_payment") {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      } else {
        if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setPollTimedOut(true);
        }
      }
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
      if (manual) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    const search = new URLSearchParams(window.location.search);
    const paymentIntentId = search.get("payment_intent");
    const redirectStatus = search.get("redirect_status");

    if (paymentIntentId) {
      if (["succeeded", "requires_capture"].includes(redirectStatus ?? "")) {
        fetch(`${API_BASE}/payments/confirm/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentIntentId }),
        }).catch(() => { });
      } else if (redirectStatus && redirectStatus !== "processing") {
        setPaymentFailed(true);
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    }
  }, [id]);

  useEffect(() => {
    pollStartRef.current = Date.now();
    void load();
    pollRef.current = setInterval(() => { void load(); }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (booking?.status === "awaiting_payment" && !paymentFailed && !showRetryButton) {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => setShowRetryButton(true), RETRY_HINT_MS);
    }
    if (booking?.status !== "awaiting_payment" && retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.status, paymentFailed]);

  if (isLoading) {
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
          <Link href="/passenger/rides">
            <Button className="bg-primary text-black rounded-none uppercase tracking-widest text-xs">View My Bookings</Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="border-white/20 text-white hover:bg-white hover:text-black rounded-none uppercase tracking-widest text-xs">Return Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const awaitingPayment = booking.status === "awaiting_payment";
  const isAuthorized = booking.status === "authorized";
  const isCancelled = booking.status === "cancelled";

  const showPaymentFailed = paymentFailed || (awaitingPayment && pollTimedOut);

  return (
    <div className="min-h-screen bg-[#050505] pt-32 pb-24">
      <div className="container mx-auto px-6 max-w-3xl">
        <div className="bg-black border border-white/10 p-8 md:p-16 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />

          {isCancelled ? (
            <>
              <XCircle className="w-20 h-20 text-red-500 mx-auto mb-8" />
              <h1 className="text-2xl sm:text-4xl font-serif text-white mb-2">Booking Cancelled</h1>
              <p className="text-gray-400 text-base mb-8">This reservation was cancelled. No charge was made to your card.</p>
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
          ) : awaitingPayment && showPaymentFailed ? (
            <>
              <AlertTriangle className="w-20 h-20 text-amber-500 mx-auto mb-8" />
              <h1 className="text-2xl sm:text-4xl font-serif text-white mb-2">Payment Not Completed</h1>
              <p className="text-gray-400 text-base mb-4">
                {paymentFailed
                  ? "Your payment could not be processed. Please try again with a different card."
                  : "Payment confirmation is taking longer than expected. Your card may not have been charged."}
              </p>
              <p className="text-gray-600 text-sm mb-8">
                Your booking reference is held for now. If you were charged, please contact us at{" "}
                <a href="mailto:info@royalmidnight.com" className="text-primary underline">info@royalmidnight.com</a>.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
                <Link href="/book">
                  <Button className="w-full sm:w-auto bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-xs px-8 py-6 rounded-none">
                    Try Again
                  </Button>
                </Link>
                <Link href="/passenger/rides">
                  <Button variant="outline" className="w-full sm:w-auto border-white/20 text-white hover:bg-white hover:text-black font-medium uppercase tracking-widest text-xs px-8 py-6 rounded-none">
                    View My Bookings
                  </Button>
                </Link>
              </div>
            </>
          ) : awaitingPayment ? (
            <>
              <div className="w-20 h-20 mx-auto mb-8 flex items-center justify-center border border-primary/30 bg-primary/5">
                <Clock className="w-10 h-10 text-primary animate-pulse" />
              </div>
              <h1 className="text-2xl sm:text-4xl font-serif text-white mb-2">Payment Processing</h1>
              <p className="text-gray-400 text-base mb-4">Your payment is being confirmed. This page will update automatically.</p>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-6">
                <Loader2 className="w-3 h-3 animate-spin" />
                Checking payment status every few seconds&hellip;
              </div>
              {showRetryButton && (
                <div className="mb-8 p-4 border border-white/10 bg-white/3 text-sm text-gray-400">
                  <p className="mb-3">Taking longer than expected? If your payment didn't go through, you can try again.</p>
                  <Link href="/book">
                    <Button className="bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-xs px-6 py-4 rounded-none">
                      Retry Payment
                    </Button>
                  </Link>
                </div>
              )}
            </>
          ) : isAuthorized ? (
            <>
              <CheckCircle2 className="w-20 h-20 text-primary mx-auto mb-8" />
              <h1 className="text-2xl sm:text-4xl font-serif text-white mb-2">Reservation Received</h1>
              <div className="inline-flex items-center gap-2 bg-amber-400/10 border border-amber-400/30 text-amber-300 text-sm px-5 py-3 mb-6">
                <CreditCard className="w-4 h-4 flex-shrink-0" />
                <span>Your card has been authorized — you will only be charged when a driver accepts your booking.</span>
              </div>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-20 h-20 text-primary mx-auto mb-8" />
              <h1 className="text-2xl sm:text-4xl font-serif text-white mb-2">Reservation Confirmed</h1>
              <p className="text-gray-400 text-base mb-8">Thank you for choosing Royal Midnight. Your vehicle has been secured.</p>
            </>
          )}

          {!isCancelled && !showPaymentFailed && (
            <>
              <div className="inline-block bg-white/5 border border-white/10 px-8 py-4 mb-10">
                <span className="block text-xs uppercase tracking-widest text-gray-500 mb-1">Reference Number</span>
                <span className="text-2xl font-mono text-primary tracking-widest">RM-{booking.id.toString().padStart(6, "0")}</span>
              </div>

              <div className="text-left bg-white/5 p-6 sm:p-8 border border-white/5 mb-8 space-y-5">
                <h3 className="text-lg font-serif text-white border-b border-white/10 pb-3 mb-2">Itinerary Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
                  <div className="flex gap-3">
                    <Calendar className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-gray-500 uppercase tracking-widest text-xs mb-0.5">Date & Time</p>
                      <p className="text-white">{format(new Date(booking.pickupAt), "PPP 'at' p")}</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <User className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-gray-500 uppercase tracking-widest text-xs mb-0.5">Passenger</p>
                      <p className="text-white">{booking.passengerName}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 sm:col-span-2">
                    <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-gray-500 uppercase tracking-widest text-xs mb-0.5">Pick-up</p>
                      <p className="text-white">{booking.pickupAddress}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 sm:col-span-2">
                    <MapPin className="w-4 h-4 text-primary/50 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-gray-500 uppercase tracking-widest text-xs mb-0.5">Drop-off</p>
                      <p className="text-white">{booking.dropoffAddress}</p>
                    </div>
                  </div>
                  {booking.priceQuoted != null && (
                    <div className="flex gap-3 sm:col-span-2 pt-2 border-t border-white/5">
                      <CreditCard className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-gray-500 uppercase tracking-widest text-xs mb-0.5">{isAuthorized ? "Amount Authorized" : awaitingPayment ? "Amount" : "Total Charged"}</p>
                        <p className="text-white font-medium">${booking.priceQuoted.toFixed(2)}</p>
                        {booking.discountAmount != null && booking.discountAmount > 0 && (
                          <p className="text-green-400 text-xs mt-0.5">Includes ${booking.discountAmount.toFixed(2)} promo discount</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {!awaitingPayment && booking.passengerEmail && (
                <p className="text-gray-500 text-sm mb-8">A confirmation has been sent to {booking.passengerEmail}.</p>
              )}

              {awaitingPayment ? (
                <div className="flex flex-col sm:flex-row justify-center gap-4">
                  <Button
                    variant="outline"
                    onClick={() => void load(true)}
                    disabled={isRefreshing}
                    className="w-full sm:w-auto border-white/20 text-white hover:bg-white hover:text-black font-medium uppercase tracking-widest text-xs px-8 py-6 rounded-none"
                  >
                    {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    Check Status
                  </Button>
                  <Link href="/passenger/rides">
                    <Button variant="ghost" className="w-full sm:w-auto text-gray-400 hover:text-white font-medium uppercase tracking-widest text-xs px-8 py-6 rounded-none">
                      View My Bookings
                    </Button>
                  </Link>
                </div>
              ) : (
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
              )}
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
