import { useState } from "react";
import { useGetUserBookings } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAuth } from "@/contexts/auth";
import { LayoutDashboard, Car, MapPin, User, MessageSquare, ChevronDown, ChevronUp, Users, Briefcase, Plane, Phone, DollarSign, Clock } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

const passengerNavItems = [
  { label: "Dashboard", href: "/passenger/dashboard", icon: LayoutDashboard },
  { label: "My Rides", href: "/passenger/rides", icon: Car },
  { label: "Saved Addresses", href: "/passenger/addresses", icon: MapPin },
  { label: "Profile", href: "/passenger/profile", icon: User },
  { label: "Support", href: "/passenger/support", icon: MessageSquare },
];

function vehicleLabel(vc?: string | null) {
  if (vc === "business") return "Business Class Sedan";
  if (vc === "suv") return "Premium SUV";
  return vc ?? "—";
}

type Booking = {
  id: number;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string;
  status: string;
  vehicleClass?: string | null;
  passengers?: number | null;
  luggageCount?: number | null;
  flightNumber?: string | null;
  specialRequests?: string | null;
  priceQuoted?: number | null;
  passengerPhone?: string | null;
  promoCode?: string | null;
  discountAmount?: number | null;
};

function BookingDetailPanel({ booking }: { booking: Booking }) {
  return (
    <div className="mt-5 pt-5 border-t border-white/8 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        {booking.vehicleClass && (
          <div className="flex items-start gap-2">
            <Car className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-0.5">Vehicle</p>
              <p className="text-sm">{vehicleLabel(booking.vehicleClass)}</p>
            </div>
          </div>
        )}
        {booking.passengers != null && (
          <div className="flex items-start gap-2">
            <Users className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-0.5">Passengers</p>
              <p className="text-sm">{booking.passengers}</p>
            </div>
          </div>
        )}
        {booking.luggageCount != null && (
          <div className="flex items-start gap-2">
            <Briefcase className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-0.5">Luggage</p>
              <p className="text-sm">{booking.luggageCount} {booking.luggageCount === 1 ? "bag" : "bags"}</p>
            </div>
          </div>
        )}
        {booking.flightNumber && (
          <div className="flex items-start gap-2">
            <Plane className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-0.5">Flight</p>
              <p className="text-sm">{booking.flightNumber}</p>
            </div>
          </div>
        )}
        {booking.passengerPhone && (
          <div className="flex items-start gap-2">
            <Phone className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-0.5">Phone</p>
              <p className="text-sm">{booking.passengerPhone}</p>
            </div>
          </div>
        )}
        {booking.priceQuoted != null && (
          <div className="flex items-start gap-2">
            <DollarSign className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-0.5">Total Charged</p>
              <p className="text-sm font-medium text-primary">${booking.priceQuoted.toFixed(2)}</p>
            </div>
          </div>
        )}
        <div className="flex items-start gap-2">
          <Clock className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-0.5">Pickup Time</p>
            <p className="text-sm">{format(new Date(booking.pickupAt), "PPP 'at' p")}</p>
          </div>
        </div>
      </div>
      {booking.promoCode && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Promo:</span>
          <span className="font-mono">{booking.promoCode}</span>
          {booking.discountAmount != null && (
            <span className="text-green-400">−${booking.discountAmount.toFixed(2)}</span>
          )}
        </div>
      )}
      {booking.specialRequests && (
        <div className="flex items-start gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-0.5">Special Requests</p>
            <p className="text-sm text-muted-foreground italic">{booking.specialRequests}</p>
          </div>
        </div>
      )}
      <div className="pt-2">
        <Link href={`/passenger/rides/${booking.id}`} className="text-xs text-primary hover:underline uppercase tracking-widest">
          Full Receipt
        </Link>
      </div>
    </div>
  );
}

function RideCard({ booking, isPast }: { booking: Booking; isPast?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-card border border-border rounded-none p-6 transition-opacity ${isPast ? "opacity-75 hover:opacity-100" : ""}`}>
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-primary font-medium mb-1 uppercase tracking-widest">
            #{booking.id} · {isPast ? format(new Date(booking.pickupAt), "PPP") : format(new Date(booking.pickupAt), "PPP 'at' p")}
          </div>
          <div className="font-medium text-base mb-1 truncate">{booking.pickupAddress}</div>
          <div className="text-muted-foreground text-sm flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-muted-foreground flex-shrink-0" />
            <span className="truncate">{booking.dropoffAddress}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className={`text-xs px-2.5 py-1 border capitalize ${
            isPast
              ? "bg-muted/50 text-muted-foreground border-border"
              : "bg-primary/10 text-primary border-primary/20"
          }`}>
            {booking.status.replace(/_/g, " ")}
          </div>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && <BookingDetailPanel booking={booking} />}

      {/* Toggle button */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="mt-3 w-full flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/50 hover:text-primary transition-colors py-2 border-t border-white/6"
      >
        {expanded ? (
          <><ChevronUp className="w-3 h-3" /> Hide Details</>
        ) : (
          <><ChevronDown className="w-3 h-3" /> See Details</>
        )}
      </button>
    </div>
  );
}

function PassengerRidesInner() {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const { data: bookings, isLoading } = useGetUserBookings(userId, { query: { enabled: !!userId } });

  const upcomingBookings = (bookings?.filter(b => ['pending', 'confirmed', 'in_progress'].includes(b.status)) || []) as Booking[];
  const pastBookings = (bookings?.filter(b => ['completed', 'cancelled'].includes(b.status)) || []) as Booking[];

  return (
    <PortalLayout title="Passenger Portal" navItems={passengerNavItems}>
      <h1 className="font-serif text-2xl sm:text-3xl mb-6 sm:mb-8">My Rides</h1>

      <div className="space-y-10 sm:space-y-12">
        <section>
          <h2 className="font-serif text-xl sm:text-2xl mb-4 sm:mb-6">Upcoming Rides</h2>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2].map(i => <div key={i} className="h-28 bg-card/50 animate-pulse border border-border" />)}
            </div>
          ) : upcomingBookings.length > 0 ? (
            <div className="space-y-4">
              {upcomingBookings.map(booking => (
                <RideCard key={booking.id} booking={booking} />
              ))}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-none p-8 text-center text-muted-foreground">
              No upcoming rides.{" "}
              <Link href="/book" className="text-primary hover:underline">Book one now.</Link>
            </div>
          )}
        </section>

        <section>
          <h2 className="font-serif text-xl sm:text-2xl mb-4 sm:mb-6">Past Rides</h2>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2].map(i => <div key={i} className="h-28 bg-card/50 animate-pulse border border-border" />)}
            </div>
          ) : pastBookings.length > 0 ? (
            <div className="space-y-4">
              {pastBookings.map(booking => (
                <RideCard key={booking.id} booking={booking} isPast />
              ))}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-none p-8 text-center text-muted-foreground">
              No past rides.
            </div>
          )}
        </section>
      </div>
    </PortalLayout>
  );
}

export default function PassengerRides() {
  return (
    <AuthGuard requiredRole="passenger">
      <PassengerRidesInner />
    </AuthGuard>
  );
}
