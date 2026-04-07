import { useState, useEffect, useRef, useCallback } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings, RefreshCw } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { API_BASE } from "@/lib/constants";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

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

type ActiveTrip = {
  id: number;
  passengerName: string;
  pickupAddress: string;
  dropoffAddress: string;
  status: string;
  driverId: number | null;
  vehicleClass: string;
  pickupAt: string;
};

type DispatchDriver = {
  id: number;
  name: string;
  phone: string;
  rating: number | null;
  status: string;
  isOnline: boolean;
  totalRides: number;
  latitude: string | null;
  longitude: string | null;
  locationUpdatedAt: string | null;
};

type DispatchBoard = {
  activeTrips: ActiveTrip[];
  availableDrivers: DispatchDriver[];
  pendingBookings: ActiveTrip[];
};

const STATUS_MARKER_COLOR: Record<string, string> = {
  available: "#22c55e",
  on_break: "#f59e0b",
  unavailable: "#6b7280",
  in_trip: "#3b82f6",
};

const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  on_break: "On Break",
  unavailable: "Unavailable",
  in_trip: "In Trip",
};

const SOUTH_FLORIDA_CENTER = { lat: 25.9, lng: -80.3 };

function createSvgMarker(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2.5"/>
    <polygon points="10,27 22,27 16,38" fill="${color}"/>
    <path d="M10 14 L16 10 L22 14 L22 19 L10 19 Z" fill="white" opacity="0.9"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export default function AdminDispatch() {
  const [board, setBoard] = useState<DispatchBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Record<number, { marker: google.maps.Marker; infoWindow: google.maps.InfoWindow }>>({});

  const token = (() => {
    try {
      const raw = localStorage.getItem("rm_auth");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { token?: string };
      return parsed.token ?? null;
    } catch { return null; }
  })();

  const authHeader = token ? `Bearer ${token}` : "";

  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/dispatch`, {
        headers: authHeader ? { Authorization: authHeader } : {},
      });
      if (!res.ok) return;
      const data = await res.json() as DispatchBoard;
      setBoard(data);
      setLastRefresh(new Date());
    } catch {
      // ignore network errors
    } finally {
      setLoading(false);
    }
  }, [authHeader]);

  // Load Google Maps
  useEffect(() => {
    const apiKey = import.meta.env["VITE_GOOGLE_MAPS_API_KEY"] as string | undefined;
    if (!apiKey) {
      setMapsError("Google Maps API key not configured.");
      return;
    }
    setOptions({ key: apiKey, version: "weekly" });
    importLibrary("maps")
      .then(() => setMapsReady(true))
      .catch(() => setMapsError("Failed to load Google Maps."));
  }, []);

  // Init map once Maps API is ready and ref is mounted
  useEffect(() => {
    if (!mapsReady || !mapRef.current || googleMapRef.current) return;
    googleMapRef.current = new google.maps.Map(mapRef.current, {
      center: SOUTH_FLORIDA_CENTER,
      zoom: 10,
      mapTypeId: "roadmap",
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#2d2d4e" }] },
        { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#16162a" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f0f23" }] },
        { featureType: "poi", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "off" }] },
        { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#c9a84c" }] },
      ],
    });
  }, [mapsReady]);

  // Update markers when board data changes
  useEffect(() => {
    if (!googleMapRef.current || !board) return;

    const map = googleMapRef.current;
    const currentIds = new Set<number>();

    for (const driver of board.availableDrivers) {
      if (!driver.latitude || !driver.longitude) continue;

      const lat = parseFloat(driver.latitude);
      const lng = parseFloat(driver.longitude);
      if (isNaN(lat) || isNaN(lng)) continue;

      currentIds.add(driver.id);

      const inTrip = board.activeTrips.some(t => t.driverId === driver.id);
      const effectiveStatus = inTrip ? "in_trip" : driver.status;
      const color = STATUS_MARKER_COLOR[effectiveStatus] ?? STATUS_MARKER_COLOR["unavailable"]!;
      const iconUrl = createSvgMarker(color);

      const infoContent = `
        <div style="background:#0a0a0f;color:#f3f4f6;padding:12px 16px;font-family:Inter,sans-serif;min-width:180px;border:1px solid #27272a;">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px;color:#f9fafb;">${driver.name}</div>
          <div style="font-size:12px;color:${color};margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">${STATUS_LABEL[effectiveStatus] ?? effectiveStatus}</div>
          ${driver.rating != null ? `<div style="font-size:11px;color:#9ca3af;">Rating: ${driver.rating.toFixed(2)}</div>` : ""}
          ${inTrip ? `<div style="font-size:11px;color:#9ca3af;">Trip: #${board.activeTrips.find(t => t.driverId === driver.id)?.id ?? "—"}</div>` : ""}
          ${driver.locationUpdatedAt ? `<div style="font-size:10px;color:#6b7280;margin-top:4px;">Updated ${formatDistanceToNow(new Date(driver.locationUpdatedAt))} ago</div>` : ""}
        </div>
      `;

      const existing = markersRef.current[driver.id];
      if (existing) {
        existing.marker.setPosition({ lat, lng });
        existing.marker.setIcon({ url: iconUrl, scaledSize: new google.maps.Size(32, 40) });
        existing.infoWindow.setContent(infoContent);
      } else {
        const marker = new google.maps.Marker({
          position: { lat, lng },
          map,
          title: driver.name,
          icon: { url: iconUrl, scaledSize: new google.maps.Size(32, 40) },
        });

        const infoWindow = new google.maps.InfoWindow({ content: infoContent });

        marker.addListener("click", () => {
          infoWindow.open(map, marker);
        });

        markersRef.current[driver.id] = { marker, infoWindow };
      }
    }

    // Remove stale markers
    for (const idStr of Object.keys(markersRef.current)) {
      const id = Number(idStr);
      if (!currentIds.has(id)) {
        markersRef.current[id]?.marker.setMap(null);
        delete markersRef.current[id];
      }
    }
  }, [board]);

  // Initial fetch + 10-second polling for live location tracking
  useEffect(() => {
    void fetchBoard();
    const interval = setInterval(() => void fetchBoard(), 10000);
    return () => clearInterval(interval);
  }, [fetchBoard]);

  const driversWithLocation = board?.availableDrivers.filter(d => d.latitude && d.longitude) ?? [];
  const driversWithoutLocation = board?.availableDrivers.filter(d => !d.latitude || !d.longitude) ?? [];

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-3xl">Live Dispatch</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Updated {format(lastRefresh, "h:mm:ss a")}
          </span>
          <button
            onClick={() => void fetchBoard()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 border border-border"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="mb-6 border border-border overflow-hidden" style={{ height: 480 }}>
        {mapsError ? (
          <div className="h-full flex items-center justify-center bg-card text-muted-foreground text-sm">
            {mapsError}
          </div>
        ) : (
          <div ref={mapRef} className="w-full h-full" />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6 mb-8 px-1">
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: STATUS_MARKER_COLOR[key] }} />
            <span className="text-xs text-muted-foreground uppercase tracking-widest">{label}</span>
          </div>
        ))}
        <span className="text-xs text-muted-foreground ml-auto">{driversWithLocation.length} driver{driversWithLocation.length !== 1 ? "s" : ""} on map</span>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading dispatch board...</div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Active Trips */}
          <div>
            <h2 className="font-serif text-xl mb-4 text-primary">
              Active Trips ({board?.activeTrips.length ?? 0})
            </h2>
            <div className="space-y-3">
              {board?.activeTrips.length === 0 && (
                <div className="bg-card border border-border p-6 text-center text-muted-foreground text-sm">
                  No active trips right now.
                </div>
              )}
              {board?.activeTrips.map(trip => (
                <div key={trip.id} className="bg-card border border-border p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium">#{trip.id} — {trip.passengerName}</div>
                    <span className="text-xs px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest">
                      {trip.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div><span className="font-medium text-foreground">From:</span> {trip.pickupAddress}</div>
                    <div><span className="font-medium text-foreground">To:</span> {trip.dropoffAddress}</div>
                    <div className="pt-2 mt-2 border-t border-border text-xs">
                      Driver ID: {trip.driverId ?? "Unassigned"} · {format(new Date(trip.pickupAt), "MMM d 'at' h:mm a")}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pending Bookings */}
            {(board?.pendingBookings.length ?? 0) > 0 && (
              <>
                <h2 className="font-serif text-xl mt-8 mb-4 text-primary">
                  Pending ({board?.pendingBookings.length ?? 0})
                </h2>
                <div className="space-y-3">
                  {board?.pendingBookings.map(trip => (
                    <div key={trip.id} className="bg-card border border-border p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-medium">#{trip.id} — {trip.passengerName}</div>
                        <span className="text-xs px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-widest">
                          Pending
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {trip.pickupAddress} → {trip.dropoffAddress}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {format(new Date(trip.pickupAt), "MMM d 'at' h:mm a")}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Drivers */}
          <div>
            <h2 className="font-serif text-xl mb-4 text-primary">
              All Drivers ({board?.availableDrivers.length ?? 0})
            </h2>
            <div className="space-y-3">
              {board?.availableDrivers.length === 0 && (
                <div className="bg-card border border-border p-6 text-center text-muted-foreground text-sm">
                  No approved drivers.
                </div>
              )}
              {board?.availableDrivers.map(driver => {
                const inTrip = board.activeTrips.some(t => t.driverId === driver.id);
                const effectiveStatus = inTrip ? "in_trip" : driver.status;
                const color = STATUS_MARKER_COLOR[effectiveStatus] ?? "#6b7280";
                const hasLocation = !!(driver.latitude && driver.longitude);

                return (
                  <div key={driver.id} className="bg-card border border-border p-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <div>
                        <div className="font-medium">{driver.name}</div>
                        <div className="text-sm text-muted-foreground">{driver.phone}</div>
                        {hasLocation && driver.locationUpdatedAt && (
                          <div className="text-xs text-muted-foreground/60 mt-0.5">
                            GPS {formatDistanceToNow(new Date(driver.locationUpdatedAt))} ago
                          </div>
                        )}
                        {!hasLocation && (
                          <div className="text-xs text-muted-foreground/40 mt-0.5">No location data</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {driver.rating != null && (
                        <div className="text-sm font-medium mb-1">{driver.rating.toFixed(2)}</div>
                      )}
                      <span
                        className="text-xs px-2 py-1 border uppercase tracking-widest"
                        style={{
                          background: `${color}18`,
                          borderColor: `${color}33`,
                          color,
                        }}
                      >
                        {STATUS_LABEL[effectiveStatus] ?? effectiveStatus}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {driversWithoutLocation.length > 0 && (
              <p className="text-xs text-muted-foreground mt-3 pl-1">
                {driversWithoutLocation.length} driver{driversWithoutLocation.length !== 1 ? "s" : ""} not sharing location — no pin on map.
              </p>
            )}
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
