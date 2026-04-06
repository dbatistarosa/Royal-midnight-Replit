import React, { useState } from "react";
import { useListDrivers } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings, CheckCircle, XCircle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { API_BASE } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const adminNavItems = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Bookings", href: "/admin/bookings", icon: Calendar },
  { label: "Dispatch", href: "/admin/dispatch", icon: Map },
  { label: "Passengers", href: "/admin/passengers", icon: Users },
  { label: "Drivers", href: "/admin/drivers", icon: Users },
  { label: "Fleet", href: "/admin/fleet", icon: Car },
  { label: "Pricing", href: "/admin/pricing", icon: DollarSign },
  { label: "Promos", href: "/admin/promos", icon: Tag },
  { label: "Support", href: "/admin/support", icon: MessageSquare },
  { label: "Reports", href: "/admin/reports", icon: BarChart },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

type DriverRow = {
  id: number;
  userId?: number | null;
  name: string;
  email: string;
  phone: string;
  status: string;
  isOnline: boolean;
  rating?: number | null;
  totalRides: number;
  approvalStatus?: string;
  rejectionReason?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: string | null;
  vehicleColor?: string | null;
  passengerCapacity?: number | null;
  luggageCapacity?: number | null;
  hasCarSeat?: boolean | null;
  serviceArea?: string | null;
  licenseNumber?: string | null;
  licenseExpiry?: string | null;
  licenseDoc?: string | null;
  regVin?: string | null;
  regPlate?: string | null;
  regExpiry?: string | null;
  regDoc?: string | null;
  insuranceExpiry?: string | null;
  insuranceDoc?: string | null;
};

function ApprovalBadge({ status }: { status?: string }) {
  if (status === "approved") return <span className="px-2 py-0.5 text-[10px] uppercase tracking-widest rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Approved</span>;
  if (status === "rejected") return <span className="px-2 py-0.5 text-[10px] uppercase tracking-widest rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Rejected</span>;
  return <span className="px-2 py-0.5 text-[10px] uppercase tracking-widest rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending</span>;
}

function DetailRow({ label, value }: { label: string; value?: string | number | boolean | null }) {
  const display = value == null ? "—" : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value) || "—";
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className="text-sm text-white">{display}</p>
    </div>
  );
}

export default function AdminDrivers() {
  const { data: drivers, isLoading, refetch } = useListDrivers();
  const { toast } = useToast();
  const { token } = useAuth();
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<number, string>>({});
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  const authHeaders = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const handleApprove = async (driverId: number) => {
    setActionLoading(driverId);
    try {
      const res = await fetch(`${API_BASE}/drivers/${driverId}/approve`, {
        method: "PATCH",
        headers: authHeaders,
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || "Failed to approve");
      }
      toast({ title: "Driver approved", description: "The driver can now go online." });
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not approve driver.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
    setActionLoading(null);
  };

  const handleReject = async (driverId: number) => {
    setActionLoading(driverId);
    try {
      const reason = rejectReason[driverId] || "";
      const res = await fetch(`${API_BASE}/drivers/${driverId}/reject`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || "Failed to reject");
      }
      toast({ title: "Driver rejected", description: "The driver has been notified." });
      setRejectingId(null);
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not reject driver.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
    setActionLoading(null);
  };

  const pendingCount = (drivers as DriverRow[] | undefined)?.filter(d => !d.approvalStatus || d.approvalStatus === "pending").length ?? 0;

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="font-serif text-3xl mb-1">Drivers</h1>
          {pendingCount > 0 && (
            <p className="text-sm text-yellow-400">{pendingCount} application{pendingCount > 1 ? "s" : ""} pending review</p>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{drivers?.length ?? 0} total</span>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-background/50 border-b border-border">
              <tr>
                <th className="px-5 py-4 font-medium text-muted-foreground">ID</th>
                <th className="px-5 py-4 font-medium text-muted-foreground">Name</th>
                <th className="px-5 py-4 font-medium text-muted-foreground">Application</th>
                <th className="px-5 py-4 font-medium text-muted-foreground hidden md:table-cell">Online</th>
                <th className="px-5 py-4 font-medium text-muted-foreground hidden md:table-cell">Rating</th>
                <th className="px-5 py-4 font-medium text-muted-foreground hidden md:table-cell">Rides</th>
                <th className="px-5 py-4 font-medium text-muted-foreground">Actions</th>
                <th className="px-5 py-4 font-medium text-muted-foreground w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading drivers...
                  </td>
                </tr>
              ) : !drivers?.length ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">No drivers found.</td>
                </tr>
              ) : (drivers as DriverRow[]).map((driver) => {
                const isPending = !driver.approvalStatus || driver.approvalStatus === "pending";
                const isExpanded = expandedId === driver.id;
                const isRejecting = rejectingId === driver.id;
                const loading = actionLoading === driver.id;

                return (
                  <React.Fragment key={driver.id}>
                    <tr className={`hover:bg-background/50 ${isPending ? "bg-yellow-500/[0.02]" : ""}`}>
                      <td className="px-5 py-4 font-medium text-muted-foreground">#{driver.id}</td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-white">{driver.name}</div>
                        <div className="text-xs text-muted-foreground">{driver.email}</div>
                      </td>
                      <td className="px-5 py-4">
                        <ApprovalBadge status={driver.approvalStatus} />
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        {driver.isOnline ? (
                          <span className="text-green-400 text-xs">Online</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Offline</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground hidden md:table-cell">{driver.rating?.toFixed(2) ?? "—"}</td>
                      <td className="px-5 py-4 text-muted-foreground hidden md:table-cell">{driver.totalRides}</td>
                      <td className="px-5 py-4">
                        {isPending && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white rounded-none text-xs h-8 px-3"
                              onClick={() => handleApprove(driver.id)}
                              disabled={loading}
                            >
                              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle className="w-3 h-3 mr-1" />Approve</>}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-900/40 text-red-400 hover:bg-red-900/10 rounded-none text-xs h-8 px-3"
                              onClick={() => setRejectingId(isRejecting ? null : driver.id)}
                              disabled={loading}
                            >
                              <XCircle className="w-3 h-3 mr-1" />Reject
                            </Button>
                          </div>
                        )}
                        {driver.approvalStatus === "approved" && (
                          <span className="text-xs text-muted-foreground">Active driver</span>
                        )}
                        {driver.approvalStatus === "rejected" && (
                          <span className="text-xs text-muted-foreground">Rejected</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : driver.id)}
                          className="text-muted-foreground hover:text-white transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>

                    {isRejecting && (
                      <tr className="bg-red-900/5">
                        <td colSpan={8} className="px-5 py-4">
                          <div className="flex items-center gap-3 max-w-xl">
                            <Input
                              placeholder="Optional: reason for rejection"
                              value={rejectReason[driver.id] || ""}
                              onChange={e => setRejectReason(prev => ({ ...prev, [driver.id]: e.target.value }))}
                              className="bg-white/5 border-white/10 text-white rounded-none h-9 text-xs"
                            />
                            <Button
                              size="sm"
                              className="bg-red-700 hover:bg-red-800 text-white rounded-none text-xs h-9 px-4 shrink-0"
                              onClick={() => handleReject(driver.id)}
                              disabled={loading}
                            >
                              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm Reject"}
                            </Button>
                            <button type="button" className="text-xs text-muted-foreground hover:text-white" onClick={() => setRejectingId(null)}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {isExpanded && (
                      <tr className="bg-background/30">
                        <td colSpan={8} className="px-5 py-5">
                          <div className="space-y-5">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                              <DetailRow label="Phone" value={driver.phone} />
                              <DetailRow label="Service Area" value={driver.serviceArea} />
                              <DetailRow label="User ID" value={driver.userId} />
                              <DetailRow label="Status" value={driver.status} />
                            </div>

                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 border-b border-white/8 pb-1">Vehicle</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                                <DetailRow label="Year" value={driver.vehicleYear} />
                                <DetailRow label="Make" value={driver.vehicleMake} />
                                <DetailRow label="Model" value={driver.vehicleModel} />
                                <DetailRow label="Color" value={driver.vehicleColor} />
                                <DetailRow label="Passenger Capacity" value={driver.passengerCapacity} />
                                <DetailRow label="Luggage Capacity" value={driver.luggageCapacity} />
                                <DetailRow label="Has Car Seat" value={driver.hasCarSeat} />
                              </div>
                            </div>

                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 border-b border-white/8 pb-1">Driver's License</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                                <DetailRow label="License #" value={driver.licenseNumber} />
                                <DetailRow label="Expiry" value={driver.licenseExpiry} />
                                <DetailRow label="Doc File" value={driver.licenseDoc} />
                              </div>
                            </div>

                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 border-b border-white/8 pb-1">Vehicle Registration</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                                <DetailRow label="VIN" value={driver.regVin} />
                                <DetailRow label="Plate" value={driver.regPlate} />
                                <DetailRow label="Reg. Expiry" value={driver.regExpiry} />
                                <DetailRow label="Reg. Doc" value={driver.regDoc} />
                              </div>
                            </div>

                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 border-b border-white/8 pb-1">Insurance</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                                <DetailRow label="Policy Expiry" value={driver.insuranceExpiry} />
                                <DetailRow label="Certificate Doc" value={driver.insuranceDoc} />
                              </div>
                            </div>

                            {driver.approvalStatus === "rejected" && driver.rejectionReason && (
                              <div className="bg-red-900/10 border border-red-900/30 p-4">
                                <p className="text-[10px] uppercase tracking-widest text-red-400 mb-1">Rejection Reason</p>
                                <p className="text-sm text-red-300">{driver.rejectionReason}</p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  );
}
