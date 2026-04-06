import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, History, DollarSign, User, Loader2, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { useDriverStatus } from "@/contexts/driverStatus";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";

const driverNavItems = [
  { label: "Dashboard", href: "/driver/dashboard", icon: LayoutDashboard },
  { label: "History", href: "/driver/history", icon: History },
  { label: "Earnings", href: "/driver/earnings", icon: DollarSign },
  { label: "Profile", href: "/driver/profile", icon: User },
];

type DriverAvailability = "available" | "on_break" | "unavailable";

const STATUS_CONFIG: Record<DriverAvailability, { label: string; color: string; dot: string; bg: string; border: string }> = {
  available:   { label: "Available",    color: "text-green-400",  dot: "bg-green-400",  bg: "bg-green-400/10",  border: "border-green-400/20" },
  on_break:    { label: "On a Break",   color: "text-amber-400",  dot: "bg-amber-400",  bg: "bg-amber-400/10",  border: "border-amber-400/20" },
  unavailable: { label: "Unavailable",  color: "text-gray-400",   dot: "bg-gray-400",   bg: "bg-gray-400/10",   border: "border-gray-400/20"  },
};

type BookingRow = {
  id: number;
  passengerName: string;
  pickupAddress: string;
  dropoffAddress: string;
  status: string;
  pickupAt: string;
  priceQuoted: number;
};

type EarningsData = {
  today: number;
  thisWeek: number;
  thisMonth: number;
  totalRides: number;
  avgPerRide: number;
};

function StatusToggle({ driverId, currentStatus, authHeader }: { driverId: number; currentStatus: string; authHeader: string }) {
  const [open, setOpen] = useState(false);
  const [localStatus, setLocalStatus] = useState<DriverAvailability>(
    ["available", "on_break", "unavailable"].includes(currentStatus)
      ? (currentStatus as DriverAvailability)
      : "unavailable"
  );
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { setDriverRecord, driverRecord } = useDriverStatus();

  const handleChange = async (newStatus: DriverAvailability) => {
    setOpen(false);
    if (newStatus === localStatus) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/drivers/${driverId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        toast({ title: "Status update failed", description: err.error, variant: "destructive" });
        return;
      }
      const updated = await res.json() as { status: string; isOnline: boolean };
      setLocalStatus(newStatus);
      if (driverRecord) setDriverRecord({ ...driverRecord, status: updated.status, isOnline: updated.isOnline });
    } catch {
      toast({ title: "Error", description: "Could not update status.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const cfg = STATUS_CONFIG[localStatus];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-none text-sm font-medium border transition-colors ${cfg.bg} ${cfg.color} ${cfg.border}`}
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />}
        {cfg.label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border shadow-lg z-50">
          {(Object.entries(STATUS_CONFIG) as [DriverAvailability, typeof STATUS_CONFIG[DriverAvailability]][]).map(([key, c]) => (
            <button
              key={key}
              onClick={() => handleChange(key)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-white/5 transition-colors text-left ${key === localStatus ? "text-primary" : "text-foreground"}`}
            >
              <span className={`w-2 h-2 rounded-full ${c.dot}`} />
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type DashboardTab = "available" | "my_rides";

function BookingCard({ booking }: { booking: BookingRow }) {
  return (
    <div className="bg-card border border-border rounded-none p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="text-xs text-primary font-medium mb-1 uppercase tracking-widest">#{booking.id}</div>
          <div className="font-medium">{booking.passengerName}</div>
        </div>
        <span className="text-xs px-2 py-1 bg-primary/10 text-primary border border-primary/20 capitalize">
          {booking.status.replace("_", " ")}
        </span>
      </div>
      <div className="text-sm text-muted-foreground">
        {booking.pickupAddress} → {booking.dropoffAddress}
      </div>
      {booking.pickupAt && (
        <div className="text-xs text-muted-foreground mt-1">
          {format(new Date(booking.pickupAt), "MMM d, yyyy 'at' h:mm a")}
        </div>
      )}
    </div>
  );
}

function ApprovedDashboard({ driverId, authHeader, rating }: { driverId: number; authHeader: string; rating: number | null }) {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [loadingEarnings, setLoadingEarnings] = useState(true);
  const [activeTab, setActiveTab] = useState<DashboardTab>("available");

  useEffect(() => {
    fetch(`${API_BASE}/bookings?driverId=${driverId}`, { headers: { Authorization: authHeader } })
      .then(r => r.ok ? r.json() as Promise<BookingRow[]> : Promise.resolve([]))
      .then(data => setBookings(Array.isArray(data) ? data : []))
      .catch(() => setBookings([]))
      .finally(() => setLoadingBookings(false));

    fetch(`${API_BASE}/drivers/${driverId}/earnings`, { headers: { Authorization: authHeader } })
      .then(r => r.ok ? r.json() as Promise<EarningsData> : Promise.resolve(null))
      .then(data => setEarnings(data))
      .catch(() => setEarnings(null))
      .finally(() => setLoadingEarnings(false));
  }, [driverId, authHeader]);

  const openTrips = bookings.filter(b => b.status === "pending" || b.status === "confirmed");
  const myRides = bookings.filter(b => b.status === "in_progress" || b.status === "assigned");

  const fmt$ = (n: number) => `$${n.toFixed(2)}`;

  const tabBookings = activeTab === "available" ? openTrips : myRides;
  const tabEmptyText = activeTab === "available" ? "No open trips available right now." : "No rides in progress.";

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <div className="bg-card border border-border rounded-none p-5">
          <h3 className="text-muted-foreground text-xs uppercase tracking-widest font-medium mb-2">Today's Earnings</h3>
          {loadingEarnings ? <div className="h-8 w-20 bg-muted/40 animate-pulse rounded" /> : (
            <div className="text-3xl font-serif text-primary">{fmt$(earnings?.today ?? 0)}</div>
          )}
        </div>
        <div className="bg-card border border-border rounded-none p-5">
          <h3 className="text-muted-foreground text-xs uppercase tracking-widest font-medium mb-2">Weekly Earnings</h3>
          {loadingEarnings ? <div className="h-8 w-20 bg-muted/40 animate-pulse rounded" /> : (
            <div className="text-3xl font-serif text-foreground">{fmt$(earnings?.thisWeek ?? 0)}</div>
          )}
        </div>
        <div className="bg-card border border-border rounded-none p-5">
          <h3 className="text-muted-foreground text-xs uppercase tracking-widest font-medium mb-2">Upcoming Trips</h3>
          {loadingBookings ? <div className="h-8 w-12 bg-muted/40 animate-pulse rounded" /> : (
            <div className="text-3xl font-serif text-foreground">{openTrips.length}</div>
          )}
        </div>
        <div className="bg-card border border-border rounded-none p-5">
          <h3 className="text-muted-foreground text-xs uppercase tracking-widest font-medium mb-2">Rating</h3>
          <div className="text-3xl font-serif text-foreground">
            {rating != null ? rating.toFixed(1) : "—"}
          </div>
        </div>
      </div>

      <div className="flex border-b border-border mb-6">
        {([["available", "Available Trips"], ["my_rides", "My Rides"]] as [DashboardTab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-6 py-3 text-xs uppercase tracking-widest font-medium transition-colors border-b-2 -mb-px ${
              activeTab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            {key === "available" && openTrips.length > 0 && (
              <span className="ml-2 bg-primary/20 text-primary text-xs px-1.5 py-0.5 rounded-full">
                {openTrips.length}
              </span>
            )}
            {key === "my_rides" && myRides.length > 0 && (
              <span className="ml-2 bg-amber-400/20 text-amber-400 text-xs px-1.5 py-0.5 rounded-full">
                {myRides.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loadingBookings ? (
        <div className="space-y-4">
          {[1, 2].map(i => <div key={i} className="h-28 bg-card/50 rounded-none animate-pulse border border-border" />)}
        </div>
      ) : tabBookings.length > 0 ? (
        <div className="space-y-4">
          {tabBookings.map(booking => <BookingCard key={booking.id} booking={booking} />)}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-none p-8 text-center text-muted-foreground text-sm">
          {tabEmptyText}
        </div>
      )}
    </>
  );
}

export default function DriverDashboard() {
  const { driverRecord, isLoading } = useDriverStatus();
  const { user, token } = useAuth();

  if (isLoading) {
    return (
      <PortalLayout title="Driver Portal" navItems={driverNavItems}>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </PortalLayout>
    );
  }

  const authHeader = `Bearer ${token ?? ""}`;
  const initials = user?.name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() ?? "DR";
  const currentStatus = driverRecord?.status ?? "unavailable";
  const normalizedStatus: DriverAvailability = ["available", "on_break", "unavailable"].includes(currentStatus)
    ? (currentStatus as DriverAvailability)
    : "unavailable";
  const cfg = STATUS_CONFIG[normalizedStatus];

  return (
    <PortalLayout title="Driver Portal" navItems={driverNavItems}>
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-none bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-serif text-lg">
            {initials}
          </div>
          <div>
            <h1 className="font-serif text-2xl leading-tight">{user?.name ?? "Driver"}</h1>
            {driverRecord?.rating != null && (
              <div className="text-sm text-muted-foreground">
                {driverRecord.rating.toFixed(1)} rating · {driverRecord.totalRides} rides
              </div>
            )}
          </div>
        </div>
        {driverRecord && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-widest text-xs">Status</span>
            <StatusToggle driverId={driverRecord.id} currentStatus={driverRecord.status} authHeader={authHeader} />
          </div>
        )}
      </div>

      {!driverRecord && (
        <div className="bg-card border border-border rounded-none p-8 text-center text-muted-foreground text-sm">
          Driver profile not found.
        </div>
      )}
      {driverRecord && (
        <ApprovedDashboard driverId={driverRecord.id} authHeader={authHeader} rating={driverRecord.rating ?? null} />
      )}
    </PortalLayout>
  );
}
