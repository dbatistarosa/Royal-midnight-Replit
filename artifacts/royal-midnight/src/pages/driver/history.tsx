import { useListBookings } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, History, DollarSign, User } from "lucide-react";
import { format } from "date-fns";

const driverNavItems = [
  { label: "Dashboard", href: "/driver/dashboard", icon: LayoutDashboard },
  { label: "History", href: "/driver/history", icon: History },
  { label: "Earnings", href: "/driver/earnings", icon: DollarSign },
  { label: "Profile", href: "/driver/profile", icon: User },
];

export default function DriverHistory() {
  const driverId = 1; // Mock session
  const { data: bookings, isLoading } = useListBookings({ driverId }, { query: { enabled: true } });

  const pastBookings = bookings?.filter(b => ['completed', 'cancelled'].includes(b.status)) || [];

  return (
    <PortalLayout title="Driver Portal" navItems={driverNavItems}>
      <h1 className="font-serif text-3xl mb-8">Trip History</h1>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading history...</div>
      ) : pastBookings.length > 0 ? (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-background/50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium text-muted-foreground">Date</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground">Passenger</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground">Route</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground">Status</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground text-right">Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pastBookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-background/50">
                    <td className="px-6 py-4">{format(new Date(booking.pickupAt), "MMM d, HH:mm")}</td>
                    <td className="px-6 py-4">{booking.passengerName}</td>
                    <td className="px-6 py-4 max-w-[200px] truncate" title={`${booking.pickupAddress} to ${booking.dropoffAddress}`}>
                      {booking.pickupAddress.split(',')[0]} → {booking.dropoffAddress.split(',')[0]}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs capitalize">
                        {booking.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">
                      {booking.status === 'completed' ? `$${(booking.priceQuoted * 0.75).toFixed(2)}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          No completed trips yet.
        </div>
      )}
    </PortalLayout>
  );
}
