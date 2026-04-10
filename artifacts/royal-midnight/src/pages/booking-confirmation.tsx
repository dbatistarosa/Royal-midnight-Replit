import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { API_BASE } from "@/lib/constants";
import { format } from "date-fns";
import { CheckCircle2, Loader2, Calendar, MapPin, User, Mail } from "lucide-react";
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
  vehicleClass?: string | null;
};

async function fetchBooking(id: number): Promise<PublicBooking> {
  const res = await fetch(`${API_BASE}/bookings/${id}/track`);
  if (!res.ok) throw new Error("Not found");
  return res.json() as Promise<PublicBooking>;
}

export default function BookingConfirmation() {
  const [, params] = useRoute("/booking-confirmation/:id");
  const id = params?.id ? parseInt(params.id) : 0;

  const [booking, setBooking] = useState<PublicBooking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchBooking(id)
      .then(data => { setBooking(data); setError(false); })
      .catch(() => setError(true))
      .finally(() => setIsLoading(false));
  }, [id]);

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

  const isCancelled = booking.status === "cancelled";

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

              {/* Invoice notice */}
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
            </>
          )}

          {!isCancelled && (
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
                      <p className="text-gray-500 uppercase tracking-widest text-xs mb-0.5">Date &amp; Time</p>
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
                      <Mail className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-gray-500 uppercase tracking-widest text-xs mb-0.5">Estimated Total</p>
                        <p className="text-white font-medium">${booking.priceQuoted.toFixed(2)}</p>
                        <p className="text-xs text-gray-600 mt-0.5">Invoice will be sent via email</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

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
