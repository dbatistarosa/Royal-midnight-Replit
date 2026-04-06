import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, History, DollarSign, User, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useDriverStatus } from "@/contexts/driverStatus";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";

const driverNavItems = [
  { label: "Dashboard", href: "/driver/dashboard", icon: LayoutDashboard },
  { label: "History", href: "/driver/history", icon: History },
  { label: "Earnings", href: "/driver/earnings", icon: DollarSign },
  { label: "Profile", href: "/driver/profile", icon: User },
];

type BookingRow = {
  id: number;
  passengerName: string;
  pickupAddress: string;
  dropoffAddress: string;
  status: string;
  pickupAt: string;
  priceQuoted: number;
  driverEarnings?: number;
};

const STATUS_COLORS: Record<string, string> = {
  completed: "text-green-400 bg-green-400/10 border-green-400/20",
  cancelled: "text-gray-400 bg-gray-400/10 border-gray-400/20",
};

export default function DriverHistory() {
  const { driverRecord, isLoading: driverLoading } = useDriverStatus();
  const { token } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!driverRecord?.id || !token) return;
    setIsLoading(true);
    fetch(`${API_BASE}/bookings?driverId=${driverRecord.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() as Promise<BookingRow[]> : Promise.resolve([]))
      .then(data => setBookings(Array.isArray(data) ? data : []))
      .catch(() => setBookings([]))
      .finally(() => setIsLoading(false));
  }, [driverRecord?.id, token]);

  const pastBookings = bookings.filter(b => ["completed", "cancelled"].includes(b.status));

  return (
    <PortalLayout title="Driver Portal" navItems={driverNavItems}>
      <h1 className="font-serif text-3xl mb-8">Trip History</h1>

      {driverLoading || isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : pastBookings.length > 0 ? (
        <div className="bg-card border border-border rounded-none overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-background/50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Date</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Passenger</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Route</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Status</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs text-right">Your Earnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pastBookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-background/50 transition-colors">
                    <td className="px-6 py-4 text-sm">
                      {format(new Date(booking.pickupAt), "MMM d, HH:mm")}
                    </td>
                    <td className="px-6 py-4">{booking.passengerName}</td>
                    <td className="px-6 py-4 max-w-[200px] truncate text-muted-foreground" title={`${booking.pickupAddress} to ${booking.dropoffAddress}`}>
                      {booking.pickupAddress.split(",")[0]} → {booking.dropoffAddress.split(",")[0]}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 border text-xs capitalize ${STATUS_COLORS[booking.status] ?? "text-muted-foreground bg-muted border-transparent"}`}>
                        {booking.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-primary">
                      {booking.status === "completed"
                        ? `$${(booking.driverEarnings ?? booking.priceQuoted * 0.70).toFixed(2)}`
                        : <span className="text-muted-foreground">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-none p-12 text-center text-muted-foreground">
          No completed trips yet.
        </div>
      )}
    </PortalLayout>
  );
}
