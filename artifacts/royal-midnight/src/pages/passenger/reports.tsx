import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { DateRangeFilter, type DateRange } from "@/components/DateRangeFilter";
import { generatePassengerReportPdf } from "@/lib/generatePassengerReportPdf";
import {
  LayoutDashboard, Car, MapPin, User, MessageSquare, BarChart2,
  Loader2, FileDown, DollarSign, CheckCircle, TrendingUp,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
import { format, startOfMonth, endOfMonth } from "date-fns";

const passengerNavItems = [
  { label: "Dashboard", href: "/passenger/dashboard", icon: LayoutDashboard },
  { label: "My Rides", href: "/passenger/rides", icon: Car },
  { label: "Reports", href: "/passenger/reports", icon: BarChart2 },
  { label: "Saved Addresses", href: "/passenger/addresses", icon: MapPin },
  { label: "Profile", href: "/passenger/profile", icon: User },
  { label: "Support", href: "/passenger/support", icon: MessageSquare },
];

type BookingRow = {
  id: number;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string;
  status: string;
  priceQuoted: number;
  createdAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  completed: "text-green-400 bg-green-400/10 border-green-400/20",
  cancelled: "text-gray-400 bg-gray-400/10 border-gray-400/20",
  confirmed: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  pending: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  in_progress: "text-primary bg-primary/10 border-primary/20",
};

const fmt$ = (n: number) => `$${n.toFixed(2)}`;

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
  borderColor?: string;
}

function StatCard({ label, value, sub, icon: Icon, color, borderColor }: StatCardProps) {
  return (
    <div className={`bg-card border ${borderColor ?? "border-border"} rounded-none p-5`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground leading-tight">{label}</p>
        <Icon className={`w-4 h-4 shrink-0 ${color}`} />
      </div>
      <p className={`text-2xl font-serif font-semibold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function PassengerReports() {
  const { user, token } = useAuth();

  const now = new Date();
  const [dateRange, setDateRange] = useState<DateRange | null>({
    startDate: startOfMonth(now),
    endDate: endOfMonth(now),
  });
  const [allBookings, setAllBookings] = useState<BookingRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!user?.id || !token) return;
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set("userId", String(user.id));
    if (dateRange) {
      params.set("startDate", dateRange.startDate.toISOString());
      params.set("endDate", dateRange.endDate.toISOString());
    }
    fetch(`${API_BASE}/bookings?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() as Promise<BookingRow[]> : Promise.resolve([]))
      .then(data => setAllBookings(Array.isArray(data) ? data : []))
      .catch(() => setAllBookings([]))
      .finally(() => setIsLoading(false));
  }, [user?.id, token, dateRange]);

  // Server already filtered by date range — no additional client-side filtering needed
  const filteredBookings = allBookings;

  const completedTrips = filteredBookings.filter(b => b.status === "completed");
  const totalSpent = completedTrips.reduce((sum, b) => sum + (b.priceQuoted ?? 0), 0);
  const tripCount = completedTrips.length;
  const avgCostPerTrip = tripCount > 0 ? totalSpent / tripCount : 0;

  const dateRangeLabel = dateRange
    ? `${format(dateRange.startDate, "MMM d, yyyy")} – ${format(dateRange.endDate, "MMM d, yyyy")}`
    : "All Time";

  const handleDownloadPdf = async () => {
    if (!user) return;
    setPdfLoading(true);
    try {
      await generatePassengerReportPdf({
        passengerName: user.name ?? user.email ?? "Passenger",
        dateRangeLabel,
        totalSpent,
        tripCount,
        avgCostPerTrip,
        trips: filteredBookings.map(b => ({
          id: b.id,
          pickupAddress: b.pickupAddress,
          dropoffAddress: b.dropoffAddress,
          pickupAt: b.pickupAt,
          status: b.status,
          priceQuoted: b.priceQuoted,
        })),
      });
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <PortalLayout title="Passenger Portal" navItems={passengerNavItems}>
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
        <h1 className="font-serif text-2xl sm:text-3xl">Travel Reports</h1>
        <button
          onClick={handleDownloadPdf}
          disabled={pdfLoading || isLoading || filteredBookings.length === 0}
          className="flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-widest font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
          Download PDF
        </button>
      </div>

      {/* Date Range Filter */}
      <div className="mb-6 sm:mb-8">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-8">

          {/* ── Summary Cards ─────────────────────────────────────────── */}
          <div>
            <h2 className="font-serif text-lg mb-4">{dateRangeLabel}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard
                label="Total Spent"
                value={fmt$(totalSpent)}
                sub={`${tripCount} completed trips`}
                icon={DollarSign}
                color="text-primary"
                borderColor="border-primary/20"
              />
              <StatCard
                label="Trips Taken"
                value={String(tripCount)}
                sub={`${filteredBookings.length} total bookings`}
                icon={CheckCircle}
                color="text-green-400"
              />
              <StatCard
                label="Avg Cost / Trip"
                value={fmt$(avgCostPerTrip)}
                sub="Completed rides"
                icon={TrendingUp}
                color="text-blue-400"
              />
            </div>
          </div>

          {/* ── Trip Table ─────────────────────────────────────────────── */}
          <div>
            <h2 className="font-serif text-lg mb-4">Trip History</h2>
            {filteredBookings.length > 0 ? (
              <div className="bg-card border border-border rounded-none overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left min-w-[600px]">
                    <thead className="bg-background/50 border-b border-border">
                      <tr>
                        <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Date</th>
                        <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Route</th>
                        <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs">Status</th>
                        <th className="px-5 py-4 font-medium text-muted-foreground uppercase tracking-widest text-xs text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredBookings.map(booking => (
                        <tr key={booking.id} className="hover:bg-background/50 transition-colors">
                          <td className="px-5 py-4 whitespace-nowrap text-sm">
                            {format(new Date(booking.pickupAt), "MMM d, yyyy")}
                          </td>
                          <td className="px-5 py-4 max-w-[220px]">
                            <span className="block text-foreground truncate">
                              {booking.pickupAddress.split(",")[0]}
                            </span>
                            <span className="block text-muted-foreground text-xs truncate">
                              → {booking.dropoffAddress.split(",")[0]}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`px-2 py-1 border text-xs capitalize ${STATUS_COLORS[booking.status] ?? "text-muted-foreground bg-muted border-transparent"}`}>
                              {booking.status.replace("_", " ")}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right tabular-nums font-medium text-primary">
                            {fmt$(booking.priceQuoted ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-none p-12 text-center text-muted-foreground">
                No trips found for the selected period.
              </div>
            )}
          </div>

        </div>
      )}
    </PortalLayout>
  );
}
