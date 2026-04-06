import { useEffect, useState } from "react";
import { useListBookings } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, History, DollarSign, User, Loader2, Clock, XCircle } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
const driverNavItems = [
  { label: "Dashboard", href: "/driver/dashboard", icon: LayoutDashboard },
  { label: "History", href: "/driver/history", icon: History },
  { label: "Earnings", href: "/driver/earnings", icon: DollarSign },
  { label: "Profile", href: "/driver/profile", icon: User },
];

interface DriverRecord {
  id: number;
  approvalStatus: string;
  rejectionReason?: string | null;
  name: string;
  status: string;
}

function ApprovedDashboard({ driverId }: { driverId: number }) {
  const { data: bookings, isLoading } = useListBookings({ driverId });
  const activeBookings = bookings?.filter(b => ['confirmed', 'in_progress'].includes(b.status)) || [];

  return (
    <>
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-muted-foreground text-sm font-medium mb-2">Today's Earnings</h3>
          <div className="text-3xl font-serif text-foreground">—</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-muted-foreground text-sm font-medium mb-2">Trips Completed</h3>
          <div className="text-3xl font-serif text-foreground">0</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-muted-foreground text-sm font-medium mb-2">Rating</h3>
          <div className="text-3xl font-serif text-primary">—</div>
        </div>
      </div>

      <h2 className="font-serif text-2xl mb-6">Active & Upcoming Trips</h2>
      {isLoading ? (
        <div className="h-32 bg-card/50 rounded-lg animate-pulse border border-border" />
      ) : activeBookings.length > 0 ? (
        <div className="space-y-4">
          {activeBookings.map((booking) => (
            <div key={booking.id} className="bg-card border border-border rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-sm text-primary font-medium mb-1">#{booking.id}</div>
                  <div className="font-medium">{booking.passengerName}</div>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 capitalize">{booking.status}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {booking.pickupAddress} → {booking.dropoffAddress}
              </div>
              {booking.pickupAt && (
                <div className="text-xs text-muted-foreground mt-1">
                  {format(new Date(booking.pickupAt as unknown as string), "MMM d, yyyy 'at' h:mm a")}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground text-sm">
          No active trips at this time.
        </div>
      )}
    </>
  );
}

export default function DriverDashboard() {
  const { user, token } = useAuth();
  const [driverRecord, setDriverRecord] = useState<DriverRecord | null>(null);
  const [driverLoading, setDriverLoading] = useState(true);

  useEffect(() => {
    if (!user?.id || !token) {
      setDriverLoading(false);
      return;
    }
    fetch(`${API_BASE}/drivers/by-user/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((d: DriverRecord) => setDriverRecord(d))
      .catch(() => setDriverRecord(null))
      .finally(() => setDriverLoading(false));
  }, [user?.id, token]);

  if (driverLoading) {
    return (
      <PortalLayout title="Driver Portal" navItems={driverNavItems}>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </PortalLayout>
    );
  }

  if (driverRecord?.approvalStatus === "rejected") {
    return (
      <PortalLayout title="Driver Portal" navItems={driverNavItems}>
        <div className="max-w-lg mx-auto py-20 text-center">
          <div className="w-14 h-14 border border-red-900/30 bg-red-900/10 flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-2xl font-serif text-white mb-3">Application Not Approved</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-4">
            We reviewed your application but were unable to approve it at this time.
          </p>
          {driverRecord.rejectionReason && (
            <div className="bg-red-900/10 border border-red-900/30 p-4 text-left mb-6">
              <p className="text-xs uppercase tracking-widest text-red-500 mb-1">Reason</p>
              <p className="text-sm text-gray-300">{driverRecord.rejectionReason}</p>
            </div>
          )}
          <p className="text-xs text-gray-600">Please contact support if you believe this is an error.</p>
        </div>
      </PortalLayout>
    );
  }

  if (!driverRecord || driverRecord.approvalStatus === "pending") {
    return (
      <PortalLayout title="Driver Portal" navItems={driverNavItems}>
        <div className="max-w-lg mx-auto py-20 text-center">
          <div className="w-14 h-14 border border-primary/30 bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Clock className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-2xl font-serif text-white mb-3">Application Under Review</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            Your application has been received and is being reviewed by our fleet management team. This typically takes 1–2 business days.
          </p>
          <div className="grid grid-cols-3 gap-3 text-left">
            {[
              { step: "1", label: "Application Submitted", done: true },
              { step: "2", label: "Under Review", done: false, active: true },
              { step: "3", label: "Decision Issued", done: false },
            ].map(s => (
              <div key={s.step} className={`border p-3 ${s.active ? "border-primary/40 bg-primary/5" : s.done ? "border-white/10 bg-white/3" : "border-white/5"}`}>
                <p className={`text-xs font-medium mb-1 ${s.active ? "text-primary" : s.done ? "text-white" : "text-white/30"}`}>Step {s.step}</p>
                <p className={`text-xs leading-snug ${s.active ? "text-gray-300" : s.done ? "text-gray-400" : "text-gray-700"}`}>{s.label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-8">Questions? Contact us at dispatch@royalmidnight.com</p>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Driver Portal" navItems={driverNavItems}>
      <div className="flex justify-between items-center mb-8">
        <h1 className="font-serif text-3xl">Driver Dashboard</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Status:</span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-sm font-medium border border-green-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            Active
          </span>
        </div>
      </div>
      <ApprovedDashboard driverId={driverRecord.id} />
    </PortalLayout>
  );
}
