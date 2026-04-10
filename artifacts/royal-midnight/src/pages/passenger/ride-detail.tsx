import { useState, useEffect, useRef, useCallback } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { LayoutDashboard, Car, MapPin, User, MessageSquare, Download, Calendar as CalendarIcon, CreditCard, ChevronLeft, Loader2, AlertTriangle, XCircle, CheckCircle, Navigation, Star } from "lucide-react";
import { Link, useParams, useLocation } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

const passengerNavItems = [
  { label: "Dashboard", href: "/passenger/dashboard", icon: LayoutDashboard },
  { label: "My Rides", href: "/passenger/rides", icon: Car },
  { label: "Saved Addresses", href: "/passenger/addresses", icon: MapPin },
  { label: "Profile", href: "/passenger/profile", icon: User },
  { label: "Support", href: "/passenger/support", icon: MessageSquare },
];

type BookingDetail = {
  id: number;
  status: string;
  passengerName: string;
  passengerEmail?: string | null;
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
  tipAmount?: number | null;
  tipPaymentIntentId?: string | null;
};

type DriverLocation = {
  available: boolean;
  status: string;
  lat?: number;
  lng?: number;
  driverName?: string;
  locationUpdatedAt?: string | null;
  reason?: string;
};

type CancelPreview = {
  canCancel: boolean;
  tier: string;
  feePercent: number;
  feeAmount: number;
  netRefund: number;
  hoursUntilPickup: number;
  message: string;
  priceQuoted: number;
};

// ──────────────────────────────────────────────────────────────────────────────
// Live Driver Tracking Map
// ──────────────────────────────────────────────────────────────────────────────
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2d2d4e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#16162a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f0f23" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#c9a84c" }] },
];

function createCarSvgMarker(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <circle cx="20" cy="20" r="18" fill="${color}" stroke="white" stroke-width="2.5"/>
    <path d="M13 22 L15 16 L25 16 L27 22 Z" fill="white" opacity="0.9"/>
    <circle cx="15" cy="23" r="2" fill="white" opacity="0.8"/>
    <circle cx="25" cy="23" r="2" fill="white" opacity="0.8"/>
    <rect x="14" y="17" width="5" height="3" rx="0.5" fill="${color}" opacity="0.6"/>
    <rect x="21" y="17" width="5" height="3" rx="0.5" fill="${color}" opacity="0.6"/>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function createPickupMarker(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    <circle cx="16" cy="16" r="14" fill="#c9a84c" stroke="white" stroke-width="2.5"/>
    <polygon points="10,27 22,27 16,38" fill="#c9a84c"/>
    <circle cx="16" cy="16" r="5" fill="white"/>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

interface DriverTrackingMapProps {
  bookingId: number;
  token: string;
  status: string;
}

function DriverTrackingMap({ bookingId, token, status }: DriverTrackingMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);
  const pickupMarkerRef = useRef<google.maps.Marker | null>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [location, setLocation] = useState<DriverLocation | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchLocation = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/bookings/${bookingId}/driver-location`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json() as DriverLocation;
      setLocation(data);
      if (data.available) setLastUpdated(new Date());
    } catch {
      // silent — will retry
    }
  }, [bookingId, token]);

  // Load Google Maps SDK once
  useEffect(() => {
    const apiKey = import.meta.env["VITE_GOOGLE_MAPS_API_KEY"] as string | undefined;
    if (!apiKey) { setMapsError("Maps not available."); return; }
    setOptions({ key: apiKey });
    importLibrary("maps")
      .then(() => setMapsReady(true))
      .catch(() => setMapsError("Failed to load map."));
  }, []);

  // Init map once SDK is ready
  useEffect(() => {
    if (!mapsReady || !mapRef.current || googleMapRef.current) return;
    googleMapRef.current = new google.maps.Map(mapRef.current, {
      zoom: 14,
      center: { lat: 25.9, lng: -80.3 },
      mapTypeId: "roadmap",
      disableDefaultUI: true,
      zoomControl: true,
      styles: MAP_STYLES,
    });
  }, [mapsReady]);

  // Fetch location on mount and every 10 seconds
  useEffect(() => {
    fetchLocation();
    const interval = setInterval(() => { fetchLocation(); }, 10000);
    return () => clearInterval(interval);
  }, [fetchLocation]);

  // Update map markers when location changes
  useEffect(() => {
    if (!googleMapRef.current || !location?.available || !location.lat || !location.lng) return;
    const map = googleMapRef.current;
    const driverPos = { lat: location.lat, lng: location.lng };

    // Create or move driver marker
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new google.maps.Marker({
        map,
        position: driverPos,
        icon: { url: createCarSvgMarker("#3b82f6"), scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 20) },
        title: location.driverName ?? "Your Driver",
        zIndex: 10,
      });
    } else {
      driverMarkerRef.current.setPosition(driverPos);
    }

    // Center map on driver
    map.panTo(driverPos);
  }, [location]);

  // Add pickup pin once (pickup address label only — no geocoding needed for visual)
  useEffect(() => {
    if (!googleMapRef.current || pickupMarkerRef.current) return;
    // We'll show pickup pin only if we have driver coords to center from
    if (!location?.available) return;
    // We can't geocode without extra API call — skip pickup pin for now
  }, [location]);

  // Status label
  const trackingLabel =
    status === "on_way" ? "Your driver is on the way" :
    status === "on_location" ? "Your driver has arrived at pickup" :
    "Tracking active";

  const trackingColor =
    status === "on_way" ? "text-sky-400 border-sky-400/30 bg-sky-400/5" :
    "text-violet-400 border-violet-400/30 bg-violet-400/5";

  if (mapsError) {
    return (
      <div className="bg-card border border-border p-5 text-center text-sm text-muted-foreground">
        <Navigation className="w-5 h-5 mx-auto mb-2 text-primary" />
        {mapsError}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border overflow-hidden">
      {/* Header bar */}
      <div className={`flex items-center justify-between px-5 py-3 border-b ${trackingColor} border-opacity-30`} style={{ borderColor: status === "on_way" ? "rgb(56 189 248 / 0.2)" : "rgb(167 139 250 / 0.2)" }}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full animate-pulse ${status === "on_way" ? "bg-sky-400" : "bg-violet-400"}`} />
          <span className="text-xs uppercase tracking-widest font-medium">{trackingLabel}</span>
        </div>
        {lastUpdated && (
          <span className="text-[10px] text-muted-foreground">
            Updated {formatDistanceToNow(lastUpdated)} ago
          </span>
        )}
      </div>

      {/* Map */}
      <div ref={mapRef} style={{ height: 280 }} className="w-full" />

      {/* Driver name + no-location fallback */}
      <div className="px-5 py-3 border-t border-border flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Car className="w-4 h-4 text-primary" />
          {location?.available && location.driverName ? (
            <span>{location.driverName} · Live tracking</span>
          ) : location && !location.available && location.reason === "no_location" ? (
            <span>Driver location sharing is off — they are en route</span>
          ) : (
            <span>Locating your driver…</span>
          )}
        </div>
        {!mapsReady && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────────────────────────────────
function PassengerRideDetailInner() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const { token } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cancelPreview, setCancelPreview] = useState<CancelPreview | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelConfirming, setCancelConfirming] = useState(false);

  // Tip state
  const [tipAmount, setTipAmount] = useState("");
  const [tipSubmitting, setTipSubmitting] = useState(false);
  const [tipSubmitted, setTipSubmitted] = useState(false);

  // Rating state
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  const loadBooking = useCallback(() => {
    if (!id || !token) return;
    fetch(`${API_BASE}/bookings/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        if (!r.ok) throw new Error("Not found");
        return r.json() as Promise<BookingDetail>;
      })
      .then(data => setBooking(data))
      .catch(() => setBooking(null))
      .finally(() => setIsLoading(false));
  }, [id, token]);

  // Initial load
  useEffect(() => {
    setIsLoading(true);
    loadBooking();
  }, [loadBooking]);

  // Poll booking status every 15 seconds so the map appears automatically when driver departs
  useEffect(() => {
    if (!id || !token) return;
    const interval = setInterval(() => {
      fetch(`${API_BASE}/bookings/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() as Promise<BookingDetail> : Promise.reject())
        .then(data => setBooking(prev => (prev?.status !== data.status ? data : prev)))
        .catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [id, token]);

  const handleCancelPreview = async () => {
    if (!token) return;
    setCancelLoading(true);
    try {
      const res = await fetch(`${API_BASE}/bookings/${id}/cancel-preview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not load cancellation policy.");
      const data = await res.json() as CancelPreview;
      setCancelPreview(data);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not load cancellation policy.", variant: "destructive" });
    } finally {
      setCancelLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!token || !cancelPreview) return;
    setCancelConfirming(true);
    try {
      const res = await fetch(`${API_BASE}/bookings/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Could not cancel booking.");
      }
      toast({ title: "Booking cancelled", description: cancelPreview.feeAmount > 0 ? `A $${cancelPreview.feeAmount.toFixed(2)} cancellation fee applies.` : "Your booking has been cancelled at no charge." });
      setLocation("/passenger/rides");
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not cancel booking.", variant: "destructive" });
      setCancelConfirming(false);
    }
  };

  const handleTipSubmit = async () => {
    const amount = parseFloat(tipAmount);
    if (!token || isNaN(amount) || amount <= 0) return;
    setTipSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/payments/tip/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tipAmount: amount }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Could not process tip.");
      }
      setTipSubmitted(true);
      setBooking(prev => prev ? { ...prev, tipAmount: amount } : prev);
      toast({ title: "Tip sent", description: `$${amount.toFixed(2)} gratuity has been added. Thank you!` });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not process tip.", variant: "destructive" });
    } finally {
      setTipSubmitting(false);
    }
  };

  const handleRatingSubmit = async () => {
    if (!token || ratingValue < 1) return;
    setRatingSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/bookings/${id}/rate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ rating: ratingValue, comment: ratingComment || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Could not submit rating.");
      }
      setRatingSubmitted(true);
      toast({ title: "Rating submitted", description: "Thank you for your feedback!" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not submit rating.", variant: "destructive" });
    } finally {
      setRatingSubmitting(false);
    }
  };

  const statusLabel = booking?.status?.replace(/_/g, " ") ?? "";
  const isTracking = booking?.status === "on_way" || booking?.status === "on_location";

  const statusColor =
    booking?.status === "awaiting_payment" ? "border-amber-500/40 bg-amber-500/10 text-amber-400" :
    booking?.status === "pending" ? "border-blue-500/40 bg-blue-500/10 text-blue-400" :
    booking?.status === "confirmed" ? "border-primary/30 bg-primary/10 text-primary" :
    booking?.status === "on_way" ? "border-sky-500/40 bg-sky-500/10 text-sky-400" :
    booking?.status === "on_location" ? "border-violet-500/40 bg-violet-500/10 text-violet-400" :
    booking?.status === "in_progress" ? "border-green-500/40 bg-green-500/10 text-green-400" :
    booking?.status === "completed" ? "border-white/20 bg-white/5 text-muted-foreground" :
    "border-red-500/40 bg-red-500/10 text-red-400";

  return (
    <PortalLayout title="Passenger Portal" navItems={passengerNavItems}>
      <div className="mb-6">
        <Link href="/passenger/rides" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Rides
        </Link>
        <div className="flex flex-wrap justify-between items-start gap-3">
          <h1 className="font-serif text-2xl sm:text-3xl">Ride #{id}</h1>
          {booking && (
            <span className={`px-3 py-1 border text-xs uppercase tracking-widest ${statusColor}`}>
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
            {/* Live driver tracking — shown only when driver is on the way or on location */}
            {isTracking && token && (
              <DriverTrackingMap
                bookingId={id}
                token={token}
                status={booking.status}
              />
            )}

            {/* Trip Details */}
            <div className="bg-card border border-border p-5 sm:p-6">
              <h2 className="font-serif text-xl mb-6">Trip Details</h2>
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
                {booking.vehicleClass && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Vehicle</p>
                    <p className="capitalize">{booking.vehicleClass.replace("_", " ")}</p>
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

            {/* Awaiting Payment notice */}
            {booking.status === "awaiting_payment" && (
              <div className="border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-400">
                <p className="font-medium mb-1">Payment Pending</p>
                <p className="text-amber-400/70">Your reservation is confirmed but awaiting payment. Our team will be in touch to complete the process.</p>
              </div>
            )}
          </div>

          <div className="space-y-5">
            {/* Receipt */}
            {booking.priceQuoted != null && (
              <div className="bg-card border border-border p-5 sm:p-6">
                <h2 className="font-serif text-xl mb-5 flex items-center justify-between">
                  <span>Receipt</span>
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                </h2>
                <div className="space-y-3 text-sm mb-5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base Fare</span>
                    <span>${(booking.priceQuoted * 0.8).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Taxes & Fees</span>
                    <span>${(booking.priceQuoted * 0.2).toFixed(2)}</span>
                  </div>
                  {booking.discountAmount != null && booking.discountAmount > 0 && (
                    <div className="flex justify-between text-green-400">
                      <span>Discount</span>
                      <span>-${booking.discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {booking.tipAmount != null && booking.tipAmount > 0 && (
                    <div className="flex justify-between text-green-400">
                      <span>Gratuity</span>
                      <span>+${Number(booking.tipAmount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-medium text-base pt-3 border-t border-border">
                    <span>Total</span>
                    <span className="text-primary">
                      ${(booking.priceQuoted + (booking.tipAmount != null ? Number(booking.tipAmount) : 0)).toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-background p-3">
                  <Download className="w-3.5 h-3.5" />
                  <span>Billed via {booking.status === "awaiting_payment" ? "pending payment" : "card on file"}</span>
                </div>
              </div>
            )}

            {/* Add a Tip (completed trips with no tip yet and card on file) */}
            {booking?.status === "completed" && !booking.tipAmount && !tipSubmitted && (
              <div className="bg-card border border-border p-5 sm:p-6">
                <h2 className="font-serif text-xl mb-2 flex items-center gap-2">
                  <Star className="w-4 h-4 text-primary" /> Add Gratuity
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Show your appreciation — a tip is charged to your card on file.
                </p>
                <div className="flex gap-2 mb-3">
                  {[5, 10, 20].map(preset => (
                    <button
                      key={preset}
                      onClick={() => setTipAmount(String(preset))}
                      className={`flex-1 py-2 text-sm border rounded-none transition-colors ${tipAmount === String(preset) ? "border-primary bg-primary/10 text-primary" : "border-white/10 text-muted-foreground hover:border-primary/50"}`}
                    >
                      ${preset}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  max="500"
                  step="1"
                  placeholder="Custom amount"
                  value={tipAmount}
                  onChange={e => setTipAmount(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-white h-10 px-3 text-sm focus:outline-none focus:border-primary mb-3"
                />
                <Button
                  onClick={() => void handleTipSubmit()}
                  disabled={tipSubmitting || !tipAmount || parseFloat(tipAmount) <= 0}
                  className="w-full bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest"
                >
                  {tipSubmitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Processing...</> : "Send Tip"}
                </Button>
              </div>
            )}

            {/* Tip already added confirmation */}
            {booking?.status === "completed" && (booking.tipAmount || tipSubmitted) && (
              <div className="bg-card border border-green-500/20 p-5">
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  <span>Gratuity of ${(booking.tipAmount ?? parseFloat(tipAmount || "0")).toFixed(2)} added</span>
                </div>
              </div>
            )}

            {/* Rate Your Driver (completed trips, not yet rated) */}
            {booking?.status === "completed" && !ratingSubmitted && (
              <div className="bg-card border border-border p-5 sm:p-6">
                <h2 className="font-serif text-xl mb-2">Rate Your Driver</h2>
                <p className="text-sm text-muted-foreground mb-4">How was your experience?</p>
                <div className="flex gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setRatingValue(star)}
                      onMouseEnter={() => setRatingHover(star)}
                      onMouseLeave={() => setRatingHover(0)}
                      className="p-1"
                    >
                      <Star
                        className={`w-7 h-7 transition-colors ${star <= (ratingHover || ratingValue) ? "text-primary fill-primary" : "text-muted-foreground"}`}
                      />
                    </button>
                  ))}
                </div>
                <textarea
                  placeholder="Optional comment..."
                  value={ratingComment}
                  onChange={e => setRatingComment(e.target.value)}
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-primary mb-3 resize-none"
                />
                <Button
                  onClick={() => void handleRatingSubmit()}
                  disabled={ratingSubmitting || ratingValue < 1}
                  className="w-full bg-primary text-black hover:bg-primary/90 rounded-none text-xs uppercase tracking-widest"
                >
                  {ratingSubmitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Submitting...</> : "Submit Rating"}
                </Button>
              </div>
            )}

            {/* Rating submitted confirmation */}
            {ratingSubmitted && (
              <div className="bg-card border border-primary/20 p-5">
                <div className="flex items-center gap-2 text-primary text-sm">
                  <CheckCircle className="w-4 h-4" />
                  <span>Thank you for your {ratingValue}-star rating!</span>
                </div>
              </div>
            )}

            {/* Cancel Booking */}
            {booking && !["completed", "cancelled", "in_progress", "on_way", "on_location"].includes(booking.status) && (
              <div className="bg-card border border-red-500/20 p-5 sm:p-6">
                <h2 className="font-serif text-lg mb-2 text-red-400">Cancel Booking</h2>
                <p className="text-sm text-muted-foreground mb-4">Need to cancel? Review the cancellation policy before proceeding.</p>
                <Button
                  variant="outline"
                  onClick={() => void handleCancelPreview()}
                  disabled={cancelLoading}
                  className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-none text-xs uppercase tracking-widest"
                >
                  {cancelLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Loading Policy...</> : <><XCircle className="w-3.5 h-3.5 mr-2" />Cancel This Ride</>}
                </Button>
              </div>
            )}

            {/* Need Help */}
            <div className="bg-card border border-border p-5 sm:p-6">
              <h2 className="font-serif text-lg mb-3">Need Help?</h2>
              <p className="text-sm text-muted-foreground mb-4">Contact our concierge team for any assistance with this ride.</p>
              <Link href="/passenger/support" className="text-primary text-sm font-medium hover:underline">
                Report an Issue →
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-muted-foreground mb-4">We couldn't find this ride. It may belong to a different account.</p>
          <Link href="/passenger/rides" className="text-primary text-sm hover:underline">
            ← Back to My Rides
          </Link>
        </div>
      )}

      {/* Cancellation policy modal */}
      {cancelPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-card border border-border w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="font-serif text-xl flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" /> Cancel Booking
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
                  <span>Booking Total</span>
                  <span>${cancelPreview.priceQuoted.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className={cancelPreview.feeAmount > 0 ? "text-red-400" : "text-muted-foreground"}>
                    Cancellation Fee {cancelPreview.feePercent > 0 ? `(${cancelPreview.feePercent}%)` : ""}
                  </span>
                  <span className={cancelPreview.feeAmount > 0 ? "text-red-400" : "text-muted-foreground"}>
                    {cancelPreview.feeAmount > 0 ? `$${cancelPreview.feeAmount.toFixed(2)}` : "None"}
                  </span>
                </div>
                <div className="flex justify-between font-medium text-base pt-2 border-t border-border">
                  <span>Refund Amount</span>
                  <span className="text-primary">${cancelPreview.netRefund.toFixed(2)}</span>
                </div>
              </div>

              {cancelPreview.feeAmount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Refunds are processed within 5–10 business days to your original payment method.
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
                Keep Booking
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

export default function PassengerRideDetail() {
  return (
    <AuthGuard requiredRole="passenger">
      <PassengerRideDetailInner />
    </AuthGuard>
  );
}
