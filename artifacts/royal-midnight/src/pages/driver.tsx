import { useListBookings } from "@workspace/api-client-react";
import { STATUS_COLORS } from "@/lib/constants";
import { format } from "date-fns";
import { MapPin, Navigation, Clock, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Driver() {
  // Hardcoded driver ID 1 for prototype purposes. In a real app this comes from auth context.
  const driverId = 1;
  const { data: assignments, isLoading } = useListBookings({ driverId });

  const upcoming = assignments?.filter(b => ['pending', 'confirmed'].includes(b.status)) || [];
  const inProgress = assignments?.filter(b => b.status === 'in_progress') || [];
  const completed = assignments?.filter(b => b.status === 'completed') || [];

  return (
    <div className="min-h-screen bg-[#050505] pt-32 pb-24">
      <div className="container mx-auto px-6 max-w-5xl">
        <header className="mb-12 border-b border-white/10 pb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-serif text-white mb-2">Chauffeur Portal</h1>
            <p className="text-gray-400">Welcome back. You have {upcoming.length} upcoming assignments today.</p>
          </div>
          <div className="flex gap-4 text-sm">
            <div className="bg-black border border-white/10 px-6 py-3">
              <span className="text-gray-500 uppercase tracking-widest text-xs block mb-1">Status</span>
              <span className="text-green-500 flex items-center"><span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span> On Duty</span>
            </div>
          </div>
        </header>

        {inProgress.length > 0 && (
          <div className="mb-16">
            <h2 className="text-primary text-xs uppercase tracking-widest mb-6 flex items-center">
              <span className="w-2 h-2 rounded-full bg-primary mr-2 animate-pulse"></span> Active Assignment
            </h2>
            {inProgress.map(booking => (
              <div key={booking.id} className="bg-primary/5 border border-primary/20 p-6 md:p-8">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <span className="text-white font-mono text-xl block mb-1">RM-{booking.id.toString().padStart(4, '0')}</span>
                    <span className="text-gray-400 text-sm flex items-center mt-2">
                      <Clock className="w-4 h-4 mr-2 text-primary" /> {format(new Date(booking.pickupAt), "h:mm a")}
                    </span>
                  </div>
                  <Button className="bg-primary text-black rounded-none uppercase tracking-widest text-xs">Complete Ride</Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-primary/10 pt-8">
                  <div>
                    <h4 className="text-gray-400 uppercase tracking-widest text-xs mb-4">Route</h4>
                    <div className="space-y-4">
                      <div className="flex items-start">
                        <MapPin className="w-5 h-5 text-gray-500 mr-3 shrink-0" />
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Pickup</p>
                          <p className="text-white text-sm">{booking.pickupAddress}</p>
                        </div>
                      </div>
                      <div className="border-l border-white/10 h-6 ml-2.5"></div>
                      <div className="flex items-start">
                        <Navigation className="w-5 h-5 text-primary mr-3 shrink-0" />
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Dropoff</p>
                          <p className="text-white text-sm">{booking.dropoffAddress}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-gray-400 uppercase tracking-widest text-xs mb-4">Passenger</h4>
                    <div className="flex items-start">
                      <UserIcon className="w-5 h-5 text-gray-500 mr-3 shrink-0" />
                      <div>
                        <p className="text-white mb-1">{booking.passengerName}</p>
                        <p className="text-gray-400 text-sm mb-1">{booking.passengerPhone}</p>
                        {booking.flightNumber && <p className="text-primary text-sm">Flight: {booking.flightNumber}</p>}
                      </div>
                    </div>
                    {booking.specialRequests && (
                      <div className="mt-4 bg-black/50 p-4 border border-white/5">
                        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Notes</p>
                        <p className="text-gray-300 text-sm italic">"{booking.specialRequests}"</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* UPCOMING */}
          <div>
            <h2 className="text-white font-serif text-xl mb-6 border-b border-white/10 pb-4">Manifest</h2>
            <div className="space-y-4">
              {upcoming.length === 0 ? (
                <p className="text-gray-500 text-sm italic">No upcoming assignments.</p>
              ) : (
                upcoming.map(booking => (
                  <div key={booking.id} className="bg-black border border-white/10 p-6 hover:border-white/30 transition-colors">
                    <div className="flex justify-between mb-4">
                      <span className="text-white font-mono">RM-{booking.id.toString().padStart(4, '0')}</span>
                      <span className="text-primary text-sm">{format(new Date(booking.pickupAt), "HH:mm")}</span>
                    </div>
                    <div className="mb-6">
                      <p className="text-gray-400 text-sm truncate mb-1"><strong className="text-gray-500">P:</strong> {booking.pickupAddress}</p>
                      <p className="text-gray-400 text-sm truncate"><strong className="text-gray-500">D:</strong> {booking.dropoffAddress}</p>
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t border-white/5">
                      <span className="text-sm text-gray-300">{booking.passengerName}</span>
                      <Button variant="outline" className="border-white/20 text-white hover:bg-white hover:text-black rounded-none uppercase tracking-widest text-[10px] h-8">
                        Begin Route
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* COMPLETED */}
          <div>
            <h2 className="text-white font-serif text-xl mb-6 border-b border-white/10 pb-4">Logbook</h2>
            <div className="space-y-4">
              {completed.length === 0 ? (
                <p className="text-gray-500 text-sm italic">No completed runs today.</p>
              ) : (
                completed.map(booking => (
                  <div key={booking.id} className="bg-white/5 border border-white/5 p-4 flex justify-between items-center opacity-70">
                    <div>
                      <span className="text-white font-mono text-sm block mb-1">RM-{booking.id.toString().padStart(4, '0')}</span>
                      <span className="text-gray-500 text-xs">{format(new Date(booking.pickupAt), "MMM d, HH:mm")}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-400 text-sm block mb-1">{booking.passengerName}</span>
                      <span className="text-green-500 text-xs uppercase tracking-widest">Completed</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
