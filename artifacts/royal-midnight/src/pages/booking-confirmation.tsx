import { useRoute } from "wouter";
import { Link } from "wouter";
import { useGetBooking } from "@workspace/api-client-react";
import { format } from "date-fns";
import { CheckCircle2, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BookingConfirmation() {
  const [, params] = useRoute("/booking-confirmation/:id");
  const id = params?.id ? parseInt(params.id) : 0;

  const { data: booking, isLoading, error } = useGetBooking(id, {
    query: { enabled: !!id }
  });

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
        <p className="text-gray-400 mb-8">We couldn't locate this reservation.</p>
        <Link href="/">
          <Button className="bg-primary text-black rounded-none uppercase tracking-widest text-xs">Return Home</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] pt-32 pb-24">
      <div className="container mx-auto px-6 max-w-3xl">
        <div className="bg-black border border-white/10 p-8 md:p-16 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
          
          <CheckCircle2 className="w-20 h-20 text-primary mx-auto mb-8" />
          
          <h1 className="text-4xl font-serif text-white mb-2">Reservation Confirmed</h1>
          <p className="text-gray-400 text-lg mb-8">Thank you for choosing Royal Midnight. Your vehicle has been secured.</p>
          
          <div className="inline-block bg-white/5 border border-white/10 px-8 py-4 mb-12">
            <span className="block text-xs uppercase tracking-widest text-gray-500 mb-1">Reference Number</span>
            <span className="text-2xl font-mono text-primary tracking-widest">RM-{booking.id.toString().padStart(6, '0')}</span>
          </div>

          <div className="text-left bg-white/5 p-8 border border-white/5 mb-10">
            <h3 className="text-xl font-serif text-white mb-6 border-b border-white/10 pb-4">Itinerary Details</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
              <div>
                <p className="text-gray-500 uppercase tracking-widest text-xs mb-1">Date & Time</p>
                <p className="text-white text-lg">{format(new Date(booking.pickupAt), "PPP 'at' p")}</p>
              </div>
              <div>
                <p className="text-gray-500 uppercase tracking-widest text-xs mb-1">Passenger</p>
                <p className="text-white text-lg">{booking.passengerName}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-gray-500 uppercase tracking-widest text-xs mb-1">Pick-up</p>
                <p className="text-white text-lg">{booking.pickupAddress}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-gray-500 uppercase tracking-widest text-xs mb-1">Drop-off</p>
                <p className="text-white text-lg">{booking.dropoffAddress}</p>
              </div>
            </div>
          </div>

          <p className="text-gray-400 text-sm mb-8">A confirmation email has been sent to {booking.passengerEmail}.</p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href={`/track/${booking.id}`}>
              <Button className="w-full sm:w-auto bg-primary text-black hover:bg-primary/90 font-medium uppercase tracking-widest text-xs px-8 py-6 rounded-none">
                Track Ride Status
              </Button>
            </Link>
            <Button variant="outline" className="w-full sm:w-auto border-white/20 text-white hover:bg-white hover:text-black font-medium uppercase tracking-widest text-xs px-8 py-6 rounded-none">
              <FileText className="w-4 h-4 mr-2" /> Download Receipt
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
