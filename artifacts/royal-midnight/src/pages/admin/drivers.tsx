import React, { useState } from "react";
import { useListDrivers } from "@workspace/api-client-react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings, CheckCircle, XCircle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { API_BASE } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
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
  serviceArea?: string | null;
  licenseNumber?: string | null;
};

function ApprovalBadge({ status }: { status?: string }) {
  if (status === "approved") return <span className="px-2 py-0.5 text-[10px] uppercase tracking-widest rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Approved</span>;
  if (status === "rejected") return <span className="px-2 py-0.5 text-[10px] uppercase tracking-widest rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Rejected</span>;
  return <span className="px-2 py-0.5 text-[10px] uppercase tracking-widest rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending</span>;
}

export default function AdminDrivers() {
  const { data: drivers, isLoading, refetch } = useListDrivers();
  const { toast } = useToast();
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<number, string>>({});
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  const handleApprove = async (driverId: number) => {
    setActionLoading(driverId);
    try {
      const res = await fetch(`${API_BASE}/drivers/${driverId}/approve`, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed to approve");
      toast({ title: "Driver approved", description: "The driver can now go online." });
      refetch();
    } catch {
      toast({ title: "Error", description: "Could not approve driver.", variant: "destructive" });
    }
    setActionLoading(null);
  };

  const handleReject = async (driverId: number) => {
    setActionLoading(driverId);
    try {
      const reason = rejectReason[driverId] || "";
      const res = await fetch(`${API_BASE}/drivers/${driverId}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error("Failed to reject");
      toast({ title: "Driver rejected", description: "The driver has been notified." });
      setRejectingId(null);
      refetch();
    } catch {
      toast({ title: "Error", description: "Could not reject driver.", variant: "destructive" });
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
                    <tr className={`hover:bg-background/50 ${isPending ? "bg-yellow-500/3" : ""}`}>
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
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 text-sm">
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Phone</p>
                              <p className="text-white">{driver.phone || "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Service Area</p>
                              <p className="text-white">{driver.serviceArea || "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Vehicle</p>
                              <p className="text-white">
                                {driver.vehicleYear && driver.vehicleMake && driver.vehicleModel
                                  ? `${driver.vehicleYear} ${driver.vehicleMake} ${driver.vehicleModel}`
                                  : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Vehicle Color</p>
                              <p className="text-white">{driver.vehicleColor || "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">License #</p>
                              <p className="text-white">{driver.licenseNumber || "—"}</p>
                            </div>
                            {driver.approvalStatus === "rejected" && driver.rejectionReason && (
                              <div className="col-span-2">
                                <p className="text-[10px] uppercase tracking-widest text-red-400 mb-1">Rejection Reason</p>
                                <p className="text-red-300">{driver.rejectionReason}</p>
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
