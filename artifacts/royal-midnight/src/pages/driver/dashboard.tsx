import { useState, useEffect, useRef, useCallback } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, History, DollarSign, User, Loader2, ChevronDown, Star, MapPin } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useDriverStatus } from "@/contexts/driverStatus";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const LOCATION_LS_KEY = "rm_driver_location_sharing";

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
  driverEarnings?: number;
};

type EarningsData = {
  today: number;
  thisWeek: number;
  thisMonth: number;
  totalEarnings: number;
  totalRides: number;
  avgPerRide: number;
  recentPayouts: { date: string; amount: number; rides: number }[];
};

type Review = {
  id: number;
  rating: number;
  comment: string | null;
  createdAt: string;
};

type DashboardTab = "available" | "my_rides" | "earnings" | "stats" | "history" | "profile";

const TABS: { key: DashboardTab; label: string }[] = [
  { key: "available", label: "Available" },
  { key: "my_rides", label: "My Rides" },
  { key: "earnings", label: "Earnings" },
  { key: "stats", label: "Stats" },
  { key: "history", label: "History" },
  { key: "profile", label: "Profile" },
];

const fmt$ = (n: number) => `$${n.toFixed(2)}`;
const labelClass = "text-gray-400 uppercase tracking-widest text-xs block mb-1.5";
const inputClass = "bg-white/5 border-white/10 text-white rounded-none h-11";

function StatusToggle({ driverId, currentStatus, authHeader }: { driverId: number; currentStatus: string; authHeader: string }) {
  const [open, setOpen] = useState(false);
  const [localStatus, setLocalStatus] = useState<DriverAvailability>(
    ["available", "on_break", "unavailable"].includes(currentStatus)
      ? (currentStatus as DriverAvailability)
      : "unavailable"
  );
  const [saving, setSaving] = useState(false);
  const { setDriverRecord } = useDriverStatus();

  const cfg = STATUS_CONFIG[localStatus];

  async function setStatus(s: DriverAvailability) {
    if (s === localStatus) { setOpen(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/drivers/${driverId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ status: s }),
      });
      if (res.ok) {
        setLocalStatus(s);
        setDriverRecord(prev => prev ? { ...prev, status: s } : prev);
      }
    } finally {
      setSaving(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        className={`flex items-center gap-2 px-4 py-2 border text-sm font-medium transition-colors ${cfg.bg} ${cfg.border} ${cfg.color}`}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />}
        {cfg.label}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border shadow-xl min-w-[160px]">
          {(Object.entries(STATUS_CONFIG) as [DriverAvailability, typeof STATUS_CONFIG[DriverAvailability]][]).map(([key, c]) => (
            <button
              key={key}
              onClick={() => setStatus(key)}
              className={`w-full flex items-center gap-2 px-4 py-3 text-sm text-left transition-colors hover:bg-muted/50 ${key === localStatus ? c.color : "text-foreground"}`}
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

function LocationShareToggle({ driverId, authHeader }: { driverId: number; authHeader: string }) {
  const { toast } = useToast();
  const [sharing, setSharing] = useState<boolean>(() => {
    try { return localStorage.getItem(LOCATION_LS_KEY) === "true"; } catch { return false; }
  });
  const [geoError, setGeoError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendLocation = useCallback(async (lat: number, lng: number) => {
    try {
      await fetch(`${API_BASE}/drivers/${driverId}/location`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ lat, lng }),
      });
    } catch {
      // Silently ignore network errors — will retry on next interval
    }
  }, [driverId, authHeader]);

  const startSharing = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        void sendLocation(coords.latitude, coords.longitude);
        setGeoError(null);
        intervalRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(
            ({ coords: c }) => void sendLocation(c.latitude, c.longitude),
            () => {},
          );
        }, 30000);
      },
      (err) => {
        setGeoError(err.message || "Location access denied.");
        setSharing(false);
        localStorage.setItem(LOCATION_LS_KEY, "false");
      },
    );
  }, [sendLocation]);

  const stopSharing = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (sharing) startSharing();
    return () => stopSharing();
  }, [sharing, startSharing, stopSharing]);

  const toggle = () => {
    const next = !sharing;
    setSharing(next);
    localStorage.setItem(LOCATION_LS_KEY, String(next));
    if (!next) {
      toast({ title: "Location sharing disabled", description: "Dispatch will no longer see your position." });
    } else {
      toast({ title: "Location sharing enabled", description: "Your position will update every 30 seconds." });
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        className={`flex items-center gap-2 px-4 py-2 border text-sm font-medium transition-colors ${
          sharing
            ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
            : "bg-white/5 border-white/10 text-muted-foreground"
        }`}
        title={sharing ? "Disable location sharing" : "Enable location sharing"}
      >
        <MapPin className={`w-4 h-4 ${sharing ? "text-blue-400" : ""}`} />
        {sharing ? "Sharing Location" : "Share Location"}
      </button>
      {geoError && <span className="text-xs text-red-400 max-w-[200px] text-right">{geoError}</span>}
    </div>
  );
}

function BookingCard({ booking }: { booking: BookingRow }) {
  return (
    <div className="bg-card border border-border rounded-none p-5">
      <div className="flex justify-between items-start mb-3">
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

function TabAvailable({ authHeader }: { authHeader: string }) {
  const [trips, setTrips] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch unassigned pending trips — backend scopes to driverId IS NULL for drivers
    fetch(`${API_BASE}/bookings?status=pending`, { headers: { Authorization: authHeader } })
      .then(r => r.ok ? r.json() as Promise<BookingRow[]> : Promise.resolve([]))
      .then(data => setTrips(Array.isArray(data) ? data : []))
      .catch(() => setTrips([]))
      .finally(() => setLoading(false));
  }, [authHeader]);

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-card/50 animate-pulse border border-border" />)}</div>;

  return trips.length > 0 ? (
    <div className="space-y-3">
      {trips.map(b => <BookingCard key={b.id} booking={b} />)}
    </div>
  ) : (
    <div className="bg-card border border-border p-8 text-center text-muted-foreground text-sm">
      No open trips available right now.
    </div>
  );
}

function TabMyRides({ driverId, authHeader }: { driverId: number; authHeader: string }) {
  const [rides, setRides] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/bookings?driverId=${driverId}`, { headers: { Authorization: authHeader } })
      .then(r => r.ok ? r.json() as Promise<BookingRow[]> : Promise.resolve([]))
      .then(data => setRides(Array.isArray(data) ? data.filter(b => ["confirmed", "in_progress", "assigned"].includes(b.status)) : []))
      .catch(() => setRides([]))
      .finally(() => setLoading(false));
  }, [driverId, authHeader]);

  if (loading) return <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-24 bg-card/50 animate-pulse border border-border" />)}</div>;

  return rides.length > 0 ? (
    <div className="space-y-3">{rides.map(b => <BookingCard key={b.id} booking={b} />)}</div>
  ) : (
    <div className="bg-card border border-border p-8 text-center text-muted-foreground text-sm">No active rides at this time.</div>
  );
}

function TabEarnings({ driverId, authHeader }: { driverId: number; authHeader: string }) {
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/drivers/${driverId}/earnings`, { headers: { Authorization: authHeader } })
      .then(r => r.ok ? r.json() as Promise<EarningsData> : Promise.resolve(null))
      .then(data => setEarnings(data))
      .catch(() => setEarnings(null))
      .finally(() => setLoading(false));
  }, [driverId, authHeader]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Today", val: earnings?.today ?? 0, accent: true },
          { label: "This Week", val: earnings?.thisWeek ?? 0 },
          { label: "This Month", val: earnings?.thisMonth ?? 0 },
          { label: "Avg / Ride", val: earnings?.avgPerRide ?? 0 },
        ].map(({ label, val, accent }) => (
          <div key={label} className="bg-card border border-border p-5">
            <h3 className="text-muted-foreground text-xs uppercase tracking-widest mb-2">{label}</h3>
            <div className={`text-3xl font-serif ${accent ? "text-primary" : "text-foreground"}`}>{fmt$(val)}</div>
          </div>
        ))}
      </div>
      <div className="bg-card border border-border p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-serif text-lg">Last 30 Days</h2>
          <span className="text-xs text-muted-foreground uppercase tracking-widest">{earnings?.totalRides ?? 0} trips total</span>
        </div>
        {earnings?.recentPayouts && earnings.recentPayouts.length > 0 ? (
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={earnings.recentPayouts}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 0 }}
                  formatter={(val: number) => [`$${val.toFixed(2)}`, "Your earnings"]}
                />
                <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No completed trips in the last 30 days.</div>
        )}
      </div>
    </div>
  );
}

function TabStats({ driverId, authHeader, rating, totalRides }: { driverId: number; authHeader: string; rating: number | null; totalRides: number }) {
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/drivers/${driverId}/earnings`, { headers: { Authorization: authHeader } })
      .then(r => r.ok ? r.json() as Promise<EarningsData> : Promise.resolve(null))
      .then(data => setEarnings(data))
      .catch(() => setEarnings(null))
      .finally(() => setLoading(false));
  }, [driverId, authHeader]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const stats = [
    { label: "Avg Rating", value: rating != null ? `${rating.toFixed(2)} / 5` : "—", sub: "Overall score" },
    { label: "Total Rides", value: String(totalRides), sub: "Completed trips" },
    { label: "Total Earnings", value: fmt$(earnings?.totalEarnings ?? 0), sub: "Driver share (all time)" },
    { label: "Avg / Ride", value: fmt$(earnings?.avgPerRide ?? 0), sub: "Commission-based avg" },
    { label: "This Month", value: fmt$(earnings?.thisMonth ?? 0), sub: "Current month" },
    { label: "This Week", value: fmt$(earnings?.thisWeek ?? 0), sub: "Current week" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {stats.map(s => (
        <div key={s.label} className="bg-card border border-border p-6">
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">{s.label}</div>
          <div className="text-2xl font-serif mb-1">{s.value}</div>
          <div className="text-xs text-muted-foreground">{s.sub}</div>
        </div>
      ))}
    </div>
  );
}

function TabHistory({ driverId, authHeader }: { driverId: number; authHeader: string }) {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/bookings?driverId=${driverId}`, { headers: { Authorization: authHeader } })
      .then(r => r.ok ? r.json() as Promise<BookingRow[]> : Promise.resolve([]))
      .then(data => setBookings(Array.isArray(data) ? data : []))
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  }, [driverId, authHeader]);

  const past = bookings.filter(b => ["completed", "cancelled"].includes(b.status));
  const STATUS_COLORS: Record<string, string> = {
    completed: "text-green-400 bg-green-400/10 border-green-400/20",
    cancelled: "text-gray-400 bg-gray-400/10 border-gray-400/20",
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return past.length > 0 ? (
    <div className="bg-card border border-border rounded-none overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-background/50 border-b border-border">
            <tr>
              <th className="px-5 py-3 font-medium text-muted-foreground uppercase tracking-widest text-xs">Date</th>
              <th className="px-5 py-3 font-medium text-muted-foreground uppercase tracking-widest text-xs">Passenger</th>
              <th className="px-5 py-3 font-medium text-muted-foreground uppercase tracking-widest text-xs">Route</th>
              <th className="px-5 py-3 font-medium text-muted-foreground uppercase tracking-widest text-xs">Status</th>
              <th className="px-5 py-3 font-medium text-muted-foreground uppercase tracking-widest text-xs text-right">Your Earnings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {past.map(b => (
              <tr key={b.id} className="hover:bg-background/50 transition-colors">
                <td className="px-5 py-3">{format(new Date(b.pickupAt), "MMM d, HH:mm")}</td>
                <td className="px-5 py-3">{b.passengerName}</td>
                <td className="px-5 py-3 max-w-[180px] truncate text-muted-foreground" title={`${b.pickupAddress} to ${b.dropoffAddress}`}>
                  {b.pickupAddress.split(",")[0]} → {b.dropoffAddress.split(",")[0]}
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-1 border text-xs capitalize ${STATUS_COLORS[b.status] ?? "text-muted-foreground"}`}>{b.status}</span>
                </td>
                <td className="px-5 py-3 text-right font-medium text-primary">
                  {b.status === "completed" ? fmt$(b.driverEarnings ?? 0) : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ) : (
    <div className="bg-card border border-border p-12 text-center text-muted-foreground">No completed trips yet.</div>
  );
}

function TabProfile({ driverId, authHeader }: { driverId: number; authHeader: string }) {
  const { driverRecord, refetch } = useDriverStatus();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [phone, setPhone] = useState(driverRecord?.phone ?? "");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  useEffect(() => {
    if (driverRecord?.phone) setPhone(driverRecord.phone);
  }, [driverRecord?.phone]);

  useEffect(() => {
    fetch(`${API_BASE}/reviews?driverId=${driverId}`)
      .then(r => r.ok ? r.json() as Promise<Review[]> : Promise.resolve([]))
      .then(data => setReviews(Array.isArray(data) ? data : []))
      .catch(() => setReviews([]))
      .finally(() => setReviewsLoading(false));
  }, [driverId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/drivers/${driverId}/contact`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        toast({ title: "Save failed", description: err.error ?? "Could not save profile.", variant: "destructive" });
        return;
      }
      toast({ title: "Profile updated", description: "Your changes have been saved." });
      refetch();
    } catch {
      toast({ title: "Error", description: "Could not save profile.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-card border border-border p-7">
        <h2 className="text-sm text-muted-foreground uppercase tracking-widest mb-5">Account Information</h2>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Email Address</label>
            <Input value={user?.email ?? ""} disabled className={inputClass + " opacity-50"} />
          </div>
          <div>
            <label className={labelClass}>Full Name</label>
            <Input value={driverRecord?.name ?? user?.name ?? ""} disabled className={inputClass + " opacity-50"} />
            <p className="text-xs text-muted-foreground mt-1">Contact admin to change legal name.</p>
          </div>
          <div>
            <label className={labelClass}>Phone Number</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} placeholder="+1 (305) 555-0000" />
          </div>
          <div className="pt-2">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-primary text-black hover:bg-primary/90 rounded-none uppercase tracking-[0.2em] text-xs px-8 h-11"
            >
              {isSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border p-7">
        <h2 className="text-sm text-muted-foreground uppercase tracking-widest mb-5">Performance</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Star className="w-4 h-4 text-primary fill-primary" />
              <span className="text-2xl font-serif">{driverRecord?.rating?.toFixed(1) ?? "—"}</span>
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest">Rating</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-serif mb-1">{driverRecord?.totalRides ?? 0}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest">Total Rides</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-serif mb-1 capitalize">{driverRecord?.approvalStatus ?? "—"}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest">Status</div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border p-7">
        <h2 className="text-sm text-muted-foreground uppercase tracking-widest mb-5">Customer Reviews</h2>
        {reviewsLoading ? (
          <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-16 bg-muted/20 animate-pulse" />)}</div>
        ) : reviews.length > 0 ? (
          <div className="space-y-4">
            {reviews.slice(0, 10).map(review => (
              <div key={review.id} className="border border-border/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className={`w-3.5 h-3.5 ${s <= review.rating ? "text-primary fill-primary" : "text-muted-foreground/30"}`} />
                    ))}
                    <span className="text-xs text-muted-foreground ml-1">{review.rating}/5</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{format(new Date(review.createdAt), "MMM d, yyyy")}</span>
                </div>
                {review.comment && <p className="text-sm text-foreground/80 italic">"{review.comment}"</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No reviews yet. Complete your first ride to receive feedback.</p>
        )}
      </div>
    </div>
  );
}

export default function DriverDashboard() {
  const { driverRecord, isLoading } = useDriverStatus();
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>("available");
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [upcomingCount, setUpcomingCount] = useState<number | null>(null);

  const authHeader = `Bearer ${token ?? ""}`;

  // Load headline stats once driver record is available
  useEffect(() => {
    if (!driverRecord?.id || !token) return;
    const header = `Bearer ${token}`;

    fetch(`${API_BASE}/drivers/${driverRecord.id}/earnings`, { headers: { Authorization: header } })
      .then(r => r.ok ? r.json() as Promise<EarningsData> : Promise.resolve(null))
      .then(data => setEarnings(data))
      .catch(() => setEarnings(null));

    fetch(`${API_BASE}/bookings?driverId=${driverRecord.id}`, { headers: { Authorization: header } })
      .then(r => r.ok ? r.json() as Promise<BookingRow[]> : Promise.resolve([]))
      .then(data => {
        const upcoming = Array.isArray(data)
          ? data.filter(b => ["confirmed", "assigned", "in_progress"].includes(b.status)).length
          : 0;
        setUpcomingCount(upcoming);
      })
      .catch(() => setUpcomingCount(0));
  }, [driverRecord?.id, token]);

  if (isLoading) {
    return (
      <PortalLayout title="Driver Portal" navItems={driverNavItems}>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </PortalLayout>
    );
  }

  const initials = user?.name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() ?? "DR";
  const currentStatus = driverRecord?.status ?? "unavailable";
  const normalizedStatus: DriverAvailability = ["available", "on_break", "unavailable"].includes(currentStatus)
    ? (currentStatus as DriverAvailability)
    : "unavailable";

  return (
    <PortalLayout title="Driver Portal" navItems={driverNavItems}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 sm:mb-8 gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-none bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-serif text-base sm:text-lg flex-shrink-0">
            {initials}
          </div>
          <div>
            <h1 className="font-serif text-xl sm:text-2xl leading-tight">{user?.name ?? "Driver"}</h1>
            {driverRecord?.rating != null && (
              <div className="text-xs sm:text-sm text-muted-foreground">
                {driverRecord.rating.toFixed(1)} rating · {driverRecord.totalRides} rides
              </div>
            )}
          </div>
        </div>
        {driverRecord && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <LocationShareToggle driverId={driverRecord.id} authHeader={authHeader} />
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="text-xs text-muted-foreground uppercase tracking-widest hidden sm:block">Status</span>
              <StatusToggle driverId={driverRecord.id} currentStatus={normalizedStatus} authHeader={authHeader} />
            </div>
          </div>
        )}
      </div>

      {!driverRecord ? (
        <div className="bg-card border border-border p-8 text-center text-muted-foreground text-sm">
          Driver profile not found.
        </div>
      ) : (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
            <div className="bg-card border border-border p-5">
              <h3 className="text-muted-foreground text-xs uppercase tracking-widest mb-2">Today's Earnings</h3>
              <div className="text-3xl font-serif text-primary">
                {earnings ? fmt$(earnings.today) : <span className="text-muted-foreground text-xl">—</span>}
              </div>
            </div>
            <div className="bg-card border border-border p-5">
              <h3 className="text-muted-foreground text-xs uppercase tracking-widest mb-2">Weekly Earnings</h3>
              <div className="text-3xl font-serif text-foreground">
                {earnings ? fmt$(earnings.thisWeek) : <span className="text-muted-foreground text-xl">—</span>}
              </div>
            </div>
            <div className="bg-card border border-border p-5">
              <h3 className="text-muted-foreground text-xs uppercase tracking-widest mb-2">Upcoming Trips</h3>
              <div className="text-3xl font-serif text-foreground">
                {upcomingCount != null ? upcomingCount : <span className="text-muted-foreground text-xl">—</span>}
              </div>
            </div>
            <div className="bg-card border border-border p-5">
              <h3 className="text-muted-foreground text-xs uppercase tracking-widest mb-2">Rating</h3>
              <div className="text-3xl font-serif text-foreground">
                {driverRecord.rating != null ? driverRecord.rating.toFixed(1) : "—"}
              </div>
            </div>
          </div>

          {/* Tab Bar */}
          <div className="flex border-b border-border mb-6 overflow-x-auto scrollbar-hide -mx-4 sm:mx-0 px-4 sm:px-0">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-4 sm:px-5 py-3 text-xs uppercase tracking-widest font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex-shrink-0 ${
                  activeTab === key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "available" && <TabAvailable authHeader={authHeader} />}
          {activeTab === "my_rides" && <TabMyRides driverId={driverRecord.id} authHeader={authHeader} />}
          {activeTab === "earnings" && <TabEarnings driverId={driverRecord.id} authHeader={authHeader} />}
          {activeTab === "stats" && <TabStats driverId={driverRecord.id} authHeader={authHeader} rating={driverRecord.rating ?? null} totalRides={driverRecord.totalRides ?? 0} />}
          {activeTab === "history" && <TabHistory driverId={driverRecord.id} authHeader={authHeader} />}
          {activeTab === "profile" && <TabProfile driverId={driverRecord.id} authHeader={authHeader} />}
        </>
      )}
    </PortalLayout>
  );
}
