import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { API_BASE } from "@/lib/constants";
import { format } from "date-fns";
import { Loader2, MapPin, Navigation, Clock, CheckCircle2 } from "lucide-react";

type PublicBooking = {
  id: number;
  status: string;
  passengerName: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string;
  driverId: number | null;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
  confirmed: "text-primary border-primary/30 bg-primary/10",
  in_progress: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  completed: "text-green-400 border-green-400/30 bg-green-400/10",
  cancelled: "text-gray-400 border-gray-400/30 bg-gray-400/10",
};

export default function Track() {
  const [, params] = useRoute("/track/:id");
  const id = params?.id ? parseInt(params.id) : 0;

  const [booking, setBooking] = useState<PublicBooking | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE}/bookings/${id}/track`)
      .then(r => r.ok ? r.json() as Promise<PublicBooking> : Promise.resolve(null))
      .then(data => setBooking(data))
      .catch(() => setBooking(null))
      .finally(() => setIsLoading(false));
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white font-serif text-2xl">
        Booking not found.
      </div>
    );
  }

  const steps = [
    { key: "confirmed", label: "Booking Confirmed", icon: CheckCircle2 },
    { key: "driver_assigned", label: "Chauffeur Assigned", icon: Clock },
    { key: "en_route", label: "Chauffeur En Route", icon: Navigation },
    { key: "arrived", label: "Chauffeur Arrived", icon: MapPin },
    { key: "completed", label: "Journey Complete", icon: CheckCircle2 },
  ];

  const getStepStatus = (stepIndex: number) => {
    if (booking.status === "completed") return "done";
    if (booking.status === "cancelled") return "cancelled";
    if (booking.status === "in_progress") {
      if (stepIndex <= 2) return "done";
      if (stepIndex === 3) return "active";
      return "pending";
    }
    if (stepIndex === 0) return "done";
    if (stepIndex === 1 && booking.driverId) return "done";
    if (stepIndex === 1 && !booking.driverId) return "active";
    return "pending";
  };

  return (
    <div className="min-h-screen bg-[#050505] pt-32 pb-24">
      <div className="container mx-auto px-6 max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-12">
        <div>
          <h1 className="text-3xl font-serif text-white mb-2">Journey Status</h1>
          <p className="text-primary font-mono tracking-widest text-sm mb-12">RM-{booking.id.toString().padStart(6, "0")}</p>

          <div className="bg-black border border-white/10 p-8 mb-8">
            <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-6">Current Status</h3>
            <div className={`inline-block px-4 py-2 border uppercase tracking-widest text-xs font-bold mb-6 ${STATUS_COLORS[booking.status] ?? "text-gray-400 border-gray-400/30"}`}>
              {booking.status.replace("_", " ")}
            </div>

            <div className="space-y-6 border-t border-white/10 pt-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">Scheduled For</p>
                <p className="text-white">{format(new Date(booking.pickupAt), "PPPP 'at' p")}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">Passenger</p>
                <p className="text-white">{booking.passengerName}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">Pick-up</p>
                <p className="text-white text-sm">{booking.pickupAddress}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">Drop-off</p>
                <p className="text-white text-sm">{booking.dropoffAddress}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-black border border-white/10 p-8 relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-transparent opacity-50"></div>
          <h3 className="text-xl font-serif text-white mb-8">Timeline</h3>

          <div className="relative">
            <div className="absolute left-[15px] top-4 bottom-4 w-[2px] bg-white/10"></div>
            <div className="space-y-8">
              {steps.map((step, idx) => {
                const status = getStepStatus(idx);
                const Icon = step.icon;
                return (
                  <div key={step.key} className="relative flex items-center gap-6">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 transition-colors ${
                      status === "done" ? "bg-primary text-black" :
                      status === "active" ? "bg-black border-2 border-primary text-primary" :
                      "bg-black border border-white/20 text-gray-600"
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className={`text-sm uppercase tracking-widest transition-colors ${
                        status === "done" ? "text-white" :
                        status === "active" ? "text-primary font-bold" :
                        "text-gray-500"
                      }`}>
                        {step.label}
                      </p>
                      {status === "active" && <p className="text-gray-400 text-xs mt-1 italic">Waiting for update...</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
