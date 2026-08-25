import { useState, useEffect, useCallback } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { ChevronLeft, Loader2, Calendar as CalendarIcon, CreditCard, XCircle, AlertTriangle, CheckCircle } from "lucide-react";
import { Link, useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
import { authHeaders } from "@/lib/authHeaders";
import { buildReceipt } from "@/lib/receipt";
import { CharterBadge, CharterDetails, TripExtras, type TripExtra } from "@/components/TripExtrasAndCharter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { corporateNavItems } from "@/config/portalNav";
import { useVehicleClasses } from "@/hooks/useVehicleClasses";
import { STATUS_COLORS } from "@/lib/constants";

// Everything below mirrors passenger/ride-detail.tsx, scoped to what a
// corporate booker needs: no card/tip/receipt-download/rating/favorite-driver
// UI (personal-account features that don't apply to a shared company
// account), no live map (not part of this pass — see the launch audit). What
// IS here closes the actual gap that was flagged: a corporate booker had no
// way to see who their driver is, what extras are on a trip, or cancel a
// trip without emailing support.

type BookingDetail = {
  id: number;
  status: string;
  passengerName: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string;
  vehicleClass?: string | null;
  passengers?: number | null;
  luggageCount?: number | null;
  flightNumber?: string | null;
  specialRequests?: string | null;
  priceQuoted?: number | null;
  discountAmount?: number | null;
  driverId?: number | null;
  extras?: TripExtra[] | null;
  charterMode?: string | null;
  charterHours?: number | null;
  maxMilesPerHour?: number | null;
  hourlyRate?: number | null;
  extraCharge?: number | null;
  overageMinutes?: number | null;
};

type DriverInfo = {
  available: boolean;
  reason?: string;
  hoursUntilPickup?: number;
  driverName?: string;
  driverPhone?: string;
  vehicleDescription?: string;
  regPlate?: string | null;
};

type CancelPreview = {
  tier: string;
  feePercent: number;
  feeAmount: number;
  hoursUntilPickup: number;
  message: string;
  priceQuoted: number;
};

const TONE_CLASS: Record<string, string> = {
  credit: "text-green-400",
  extra: "text-amber-300",
};

function CorporateBookingDetailInner() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const { token, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { vehicleClasses } = useVehicleClasses();

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null);
  const [cancelPreview, setCancelPreview] = useState<CancelPreview | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelConfirming, setCancelConfirming] = useState(false);

  const loadBooking = useCallback(() => {
    if (!id) { setIsLoading(false); return; }
    fetch(`${API_BASE}/bookings/${id}`, { headers: authHeaders(token) })
      .then(r => {
        if (!r.ok) throw new Error("Not found");
        return r.json() as Promise<BookingDetail>;
      })
      .then(data => setBooking(data))
      .catch(() => setBooking(null))
      .finally(() => setIsLoading(false));
  }, [id, token]);

  useEffect(() => {
    setIsLoading(true);
    loadBooking();
  }, [loadBooking]);

  useEffect(() => {
    if (!id || !isAuthenticated || !booking?.driverId) { setDriverInfo(null); return; }
    fetch(`${API_BASE}/bookings/${id}/driver-info`, { headers: authHeaders(token) })
      .then(r => (r.ok ? (r.json() as Promise<DriverInfo>) : Promise.resolve(null)))
      .then(data => setDriverInfo(data))
      .catch(() => {});
  }, [id, token, isAuthenticated, booking?.driverId, booking?.status]);

  const handleCancelPreview = async () => {
    if (!isAuthenticated) return;
    setCancelLoading(true);
    try {
      const res = await fetch(`${API_BASE}/bookings/${id}/cancel-preview`, { headers: authHeaders(token) });
      if (!res.ok) throw new Error("Could not load cancellation policy.");
      setCancelPreview(await res.json() as CancelPreview);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not load cancellation policy.", variant: "destructive" });
    } finally {
      setCancelLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!isAuthenticated || !cancelPreview) return;
    setCancelConfirming(true);
    try {
      const res = await fetch(`${API_BASE}/bookings/${id}`, { method: "DELETE", headers: authHeaders(token) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Could not cancel booking.");
      }
      toast({
        title: "Booking cancelled",
        description: cancelPreview.feeAmount > 0
          ? `A $${cancelPreview.feeAmount.toFixed(2)} cancellation fee will appear on your next invoice.`
          : "This trip has been cancelled at no charge.",
      });
      setLocation("/corporate/bookings");
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not cancel booking.", variant: "destructive" });
      setCancelConfirming(false);
    }
  };

  const statusLabel = booking?.status?.replace(/_/g, " ") ?? "";
  const vehicleLabel = booking?.vehicleClass
    ? vehicleClasses.find(c => c.id === booking.vehicleClass)?.name ?? booking.vehicleClass
    : null;
  const canCancel = booking && !["completed", "cancelled", "in_progress", "on_way", "on_location"].includes(booking.status);

  return (
    <PortalLayout title="Corporate Portal" navItems={corporateNavItems}>
      <div className="mb-6">
        <Link href="/corporate/bookings" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to All Bookings
        </Link>
        <div className="flex flex-wrap justify-between items-start gap-3">
          <h1 className="font-serif text-2xl sm:text-3xl">RM-{String(id).padStart(6, "0")}</h1>
          {booking && (
            <span className={`text-xs px-2.5 py-1 rounded-full border uppercase tracking-widest ${STATUS_COLORS[booking.status] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20"}`}>
              {statusLabel}
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : booking ? (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-5">
            {/* Driver Info — same 48h-reveal rule as the passenger portal */}
            {booking.driverId && (
              <div className="bg-card border border-border p-5 sm:p-6">
                <h2 className="font-serif text-xl mb-4">Chauffeur</h2>
                {!driverInfo ? (
                  <p className="text-sm text-muted-foreground">Loading driver details…</p>
                ) : driverInfo.available ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary font-serif text-lg">{driverInfo.driverName?.[0] ?? "D"}</span>
                      </div>
                      <div>
                        <p className="font-medium">{driverInfo.driverName}</p>
                        <a href={`tel:${driverInfo.driverPhone}`} className="text-sm text-primary hover:underline">{driverInfo.driverPhone}</a>
                      </div>
                    </div>
                    {driverInfo.vehicleDescription && (
                      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Vehicle</p>
                          <p>{driverInfo.vehicleDescription}</p>
                        </div>
                        {driverInfo.regPlate && (
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Plate</p>
                            <p className="font-mono">{driverInfo.regPlate}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : driverInfo.reason === "too_early" ? (
                  <div className="text-sm text-muted-foreground">
                    <p>Driver details will be shown 48 hours before pickup.</p>
                    {driverInfo.hoursUntilPickup != null && (
                      <p className="mt-1 text-xs">~{driverInfo.hoursUntilPickup} hours to go.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">A driver has been assigned — details coming soon.</p>
                )}
              </div>
            )}

            {/* Trip Details */}
            <div className="bg-card border border-border p-5 sm:p-6">
              <h2 className="font-serif text-xl mb-6 flex flex-wrap items-center gap-3">
                <span>Trip Details</span>
                <CharterBadge booking={booking} />
              </h2>
              <div className="space-y-5 relative before:absolute before:left-[1.1rem] before:top-4 before:bottom-4 before:w-px before:bg-border">
                <div className="relative flex items-start gap-4">
                  <div className="bg-primary w-4 h-4 rounded-full relative z-10 mt-1 flex-shrink-0 ring-2 ring-primary/20" />
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      <CalendarIcon className="w-3 h-3 inline mr-1" />
                      {format(new Date(booking.pickupAt), "MMM d, yyyy 'at' h:mm a")}
                    </div>
                    <div className="font-medium">{booking.pickupAddress}</div>
                  </div>
                </div>
                <div className="relative flex items-start gap-4">
                  <div className="bg-muted-foreground w-4 h-4 rounded-full relative z-10 mt-1 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Drop-off</div>
                    <div className="font-medium">{booking.dropoffAddress}</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-border grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Passenger</p>
                  <p>{booking.passengerName}</p>
                </div>
                {vehicleLabel && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Vehicle</p>
                    <p>{vehicleLabel}</p>
                  </div>
                )}
                {booking.passengers != null && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Passengers</p>
                    <p>{booking.passengers}</p>
                  </div>
                )}
                {booking.luggageCount != null && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Luggage</p>
                    <p>{booking.luggageCount} {booking.luggageCount === 1 ? "bag" : "bags"}</p>
                  </div>
                )}
                {booking.flightNumber && (
                  <div className="col-span-2 sm:col-span-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Flight</p>
                    <p>{booking.flightNumber}</p>
                  </div>
                )}
                {booking.specialRequests && (
                  <div className="col-span-2 sm:col-span-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Special Requests</p>
                    <p className="text-muted-foreground">{booking.specialRequests}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-5">
            {/* Price breakdown + extras — the "much less detail than the passenger
                portal" gap: a corporate booker could not see extras, or any
                breakdown, on their own trips. */}
            {booking.priceQuoted != null && (() => {
              const receipt = buildReceipt({ ...booking, priceQuoted: booking.priceQuoted ?? 0 });
              return (
                <div className="bg-card border border-border p-5 sm:p-6">
                  <h2 className="font-serif text-xl mb-5 flex items-center justify-between">
                    <span>Trip Cost</span>
                    <CreditCard className="w-4 h-4 text-muted-foreground" />
                  </h2>
                  <div className="space-y-3 text-sm mb-5">
                    {receipt.lines.map(line => (
                      <div key={line.label} className={`flex justify-between ${line.tone ? TONE_CLASS[line.tone] : ""}`}>
                        <span className={line.tone ? "" : "text-muted-foreground"}>
                          {line.label}
                          {line.note && <span className="text-xs opacity-60"> · {line.note}</span>}
                        </span>
                        <span>{line.amount < 0 ? "-" : ""}${Math.abs(line.amount).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-medium text-base pt-3 border-t border-border">
                      <span>Total</span>
                      <span className="text-primary">${receipt.total.toFixed(2)}</span>
                    </div>
                  </div>
                  <TripExtras extras={booking.extras} audience="passenger" />
                  <CharterDetails booking={booking} audience="passenger" />
                  <div className="flex items-center justify-between gap-2 bg-background p-3 mt-3">
                    <span className="text-xs text-muted-foreground">Billed to your corporate account</span>
                  </div>
                </div>
              );
            })()}

            {/* Cancel Trip */}
            {canCancel && (
              <div className="bg-card border border-red-500/20 p-5 sm:p-6">
                <h2 className="font-serif text-lg mb-2 text-red-400">Cancel Trip</h2>
                <p className="text-sm text-muted-foreground mb-4">Need to cancel? Review the cancellation policy before proceeding.</p>
                <Button
                  variant="outline"
                  onClick={() => void handleCancelPreview()}
                  disabled={cancelLoading}
                  className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-none text-xs uppercase tracking-widest"
                >
                  {cancelLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Loading Policy...</> : <><XCircle className="w-3.5 h-3.5 mr-2" />Cancel This Trip</>}
                </Button>
              </div>
            )}

            {/* Need Help */}
            <div className="bg-card border border-border p-5 sm:p-6">
              <h2 className="font-serif text-lg mb-3">Need Help?</h2>
              <p className="text-sm text-muted-foreground mb-4">Contact our concierge team for any assistance with this trip.</p>
              <a href="mailto:support@royalmidnight.com" className="text-primary text-sm font-medium hover:underline">
                support@royalmidnight.com →
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-muted-foreground mb-4">We couldn't find this trip. It may belong to a different account.</p>
          <Link href="/corporate/bookings" className="text-primary text-sm hover:underline">
            ← Back to All Bookings
          </Link>
        </div>
      )}

      {/* Cancellation policy modal */}
      {cancelPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-card border border-border w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="font-serif text-xl flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" /> Cancel Trip
              </h2>
              <button onClick={() => setCancelPreview(null)} className="text-muted-foreground hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className={`border p-4 text-sm ${cancelPreview.tier === "free" ? "border-green-500/30 bg-green-500/5 text-green-400" : "border-amber-500/30 bg-amber-500/5 text-amber-400"}`}>
                {cancelPreview.tier === "free"
                  ? <CheckCircle className="w-4 h-4 inline mr-2" />
                  : <AlertTriangle className="w-4 h-4 inline mr-2" />}
                {cancelPreview.message}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Trip Value</span>
                  <span>${cancelPreview.priceQuoted.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium text-base pt-2 border-t border-border">
                  <span className={cancelPreview.feeAmount > 0 ? "text-red-400" : "text-muted-foreground"}>
                    Cancellation Fee {cancelPreview.feePercent > 0 ? `(${cancelPreview.feePercent}%)` : ""}
                  </span>
                  <span className={cancelPreview.feeAmount > 0 ? "text-red-400" : "text-muted-foreground"}>
                    {cancelPreview.feeAmount > 0 ? `$${cancelPreview.feeAmount.toFixed(2)}` : "None"}
                  </span>
                </div>
              </div>

              {cancelPreview.feeAmount > 0 && (
                <p className="text-xs text-muted-foreground">
                  This fee will be added as a line item on your next monthly invoice.
                </p>
              )}
            </div>

            <div className="px-6 py-5 border-t border-border flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setCancelPreview(null)}
                disabled={cancelConfirming}
                className="rounded-none border-white/20 text-white hover:bg-white/10 text-xs uppercase tracking-widest"
              >
                Keep Trip
              </Button>
              <Button
                onClick={() => void handleConfirmCancel()}
                disabled={cancelConfirming}
                className="bg-red-600 hover:bg-red-700 text-white rounded-none text-xs uppercase tracking-widest px-6"
              >
                {cancelConfirming ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Cancelling...</> : "Confirm Cancellation"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}

export default function CorporateBookingDetail() {
  return (
    <AuthGuard requiredRole="corporate">
      <CorporateBookingDetailInner />
    </AuthGuard>
  );
}
