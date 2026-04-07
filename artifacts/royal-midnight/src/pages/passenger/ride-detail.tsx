import { useGetBooking, getGetBookingQueryKey } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { LayoutDashboard, Car, MapPin, User, MessageSquare, Download, MapPin as MapPinIcon, Calendar as CalendarIcon, CreditCard, ChevronLeft } from "lucide-react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";

const passengerNavItems = [
  { label: "Dashboard", href: "/passenger/dashboard", icon: LayoutDashboard },
  { label: "My Rides", href: "/passenger/rides", icon: Car },
  { label: "Saved Addresses", href: "/passenger/addresses", icon: MapPin },
  { label: "Profile", href: "/passenger/profile", icon: User },
  { label: "Support", href: "/passenger/support", icon: MessageSquare },
];

function PassengerRideDetailInner() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const { data: booking, isLoading } = useGetBooking(id, { query: { enabled: !!id, queryKey: getGetBookingQueryKey(id) } });

  return (
    <PortalLayout title="Passenger Portal" navItems={passengerNavItems}>
      <div className="mb-8">
        <Link href="/passenger/rides" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Rides
        </Link>
        <div className="flex justify-between items-start gap-3">
          <h1 className="font-serif text-2xl sm:text-3xl">Ride #{id}</h1>
          {booking && (
            <span className="px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-sm font-medium">
              {booking.status.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading ride details...</div>
      ) : booking ? (
        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="font-serif text-xl mb-6">Trip Details</h2>
              
              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[1.4rem] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                <div className="relative flex items-start gap-4">
                  <div className="bg-background border-2 border-primary rounded-full p-2 relative z-10 mt-1">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">
                      {format(new Date(booking.pickupAt), "MMM d, yyyy • h:mm a")}
                    </div>
                    <div className="font-medium text-lg">{booking.pickupAddress}</div>
                  </div>
                </div>

                <div className="relative flex items-start gap-4">
                  <div className="bg-background border-2 border-muted-foreground rounded-full p-2 relative z-10 mt-1">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Dropoff</div>
                    <div className="font-medium text-lg">{booking.dropoffAddress}</div>
                  </div>
                </div>
              </div>

              {booking.flightNumber && (
                <div className="mt-8 pt-6 border-t border-border">
                  <h3 className="text-sm text-muted-foreground font-medium mb-2">Flight Information</h3>
                  <div className="font-medium">{booking.flightNumber}</div>
                </div>
              )}

              {booking.specialRequests && (
                <div className="mt-6 pt-6 border-t border-border">
                  <h3 className="text-sm text-muted-foreground font-medium mb-2">Special Requests</h3>
                  <p>{booking.specialRequests}</p>
                </div>
              )}
            </div>

            {booking.driverId && (
              <div className="bg-card border border-border rounded-lg p-6">
                <h2 className="font-serif text-xl mb-6">Your Chauffeur</h2>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-xl font-serif">
                    Ch
                  </div>
                  <div>
                    <div className="font-medium text-lg">Assigned Chauffeur</div>
                    <div className="text-muted-foreground text-sm">Driver ID: {booking.driverId}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="font-serif text-xl mb-6 flex items-center justify-between">
                <span>Receipt</span>
                <button className="text-primary hover:text-primary/80">
                  <Download className="w-5 h-5" />
                </button>
              </h2>
              
              <div className="space-y-4 text-sm mb-6">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base Fare ({booking.vehicleClass.replace('_', ' ')})</span>
                  <span>${(booking.priceQuoted * 0.8).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Taxes & Fees</span>
                  <span>${(booking.priceQuoted * 0.2).toFixed(2)}</span>
                </div>
                {booking.discountAmount && (
                  <div className="flex justify-between text-green-500">
                    <span>Discount</span>
                    <span>-${booking.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium text-lg pt-4 border-t border-border">
                  <span>Total</span>
                  <span>${booking.priceQuoted.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm text-muted-foreground bg-background p-3 rounded">
                <CreditCard className="w-4 h-4" />
                <span>Paid via Corporate Account</span>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="font-serif text-xl mb-4">Need Help?</h2>
              <p className="text-sm text-muted-foreground mb-4">
                If you have an issue with this ride, please contact our concierge team.
              </p>
              <Link href="/passenger/support" className="text-primary text-sm font-medium hover:underline">
                Report an Issue
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">Ride not found.</div>
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
