import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Loader2, Map } from "lucide-react";

type Props = {
  pickupAddress: string;
  dropoffAddress: string;
  stops?: string[];
};

type GeocodeResponse = {
  features?: Array<{ center?: [number, number] }>;
};

type DirectionsResponse = {
  routes?: Array<{
    geometry?: { type: "LineString"; coordinates: [number, number][] };
  }>;
};

export function TripRouteMap({ pickupAddress, dropoffAddress, stops = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const addresses = useMemo(
    () => [pickupAddress, ...stops.filter(Boolean), dropoffAddress].slice(0, 25),
    [pickupAddress, dropoffAddress, stops.join("\u0000")],
  );

  useEffect(() => {
    const accessToken = import.meta.env["VITE_MAPBOX_TOKEN"] as string | undefined;
    if (!accessToken || !containerRef.current) {
      setError("Route map is not configured.");
      setLoading(false);
      return;
    }
    mapboxgl.accessToken = accessToken;
    let cancelled = false;
    const markers: mapboxgl.Marker[] = [];

    const load = async () => {
      try {
        const coordinates = await Promise.all(addresses.map(async address => {
          const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`);
          url.searchParams.set("access_token", accessToken);
          url.searchParams.set("limit", "1");
          url.searchParams.set("country", "US");
          const response = await fetch(url);
          if (!response.ok) throw new Error("Could not locate a route address.");
          const data = await response.json() as GeocodeResponse;
          const center = data.features?.[0]?.center;
          if (!center) throw new Error("Could not locate a route address.");
          return center;
        }));
        const directionsUrl = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates.map(([lng, lat]) => `${lng},${lat}`).join(";")}`);
        directionsUrl.searchParams.set("access_token", accessToken);
        directionsUrl.searchParams.set("geometries", "geojson");
        directionsUrl.searchParams.set("overview", "full");
        const response = await fetch(directionsUrl);
        if (!response.ok) throw new Error("Could not draw this route.");
        const data = await response.json() as DirectionsResponse;
        const geometry = data.routes?.[0]?.geometry;
        if (!geometry?.coordinates?.length) throw new Error("No drivable route was found.");
        if (cancelled || !containerRef.current) return;

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/dark-v11",
          center: coordinates[0],
          zoom: 10,
          attributionControl: false,
        });
        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => {
          if (cancelled) return;
          map.addSource("trip-route", { type: "geojson", data: { type: "Feature", properties: {}, geometry } });
          map.addLayer({
            id: "trip-route",
            type: "line",
            source: "trip-route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#c9a84c", "line-width": 5, "line-opacity": 0.9 },
          });
          const bounds = new mapboxgl.LngLatBounds();
          geometry.coordinates.forEach(point => bounds.extend(point));
          map.fitBounds(bounds, { padding: 42, maxZoom: 13, duration: 0 });
          coordinates.forEach((point, index) => {
            const element = document.createElement("div");
            element.className = "w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-bold text-black";
            element.style.backgroundColor = index === 0 ? "#c9a84c" : index === coordinates.length - 1 ? "#60a5fa" : "#d1d5db";
            element.textContent = index === 0 ? "P" : index === coordinates.length - 1 ? "D" : String(index);
            markers.push(new mapboxgl.Marker({ element }).setLngLat(point).addTo(map));
          });
          setLoading(false);
        });
        map.on("error", () => {
          if (!cancelled) { setError("The route map could not load."); setLoading(false); }
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "The route map could not load.");
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      markers.forEach(marker => marker.remove());
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [addresses]);

  if (error) {
    return (
      <div className="border border-white/10 bg-white/[0.02] p-4 text-xs text-gray-500 flex items-center gap-2">
        <Map className="w-4 h-4 text-primary" /> {error}
      </div>
    );
  }
  return (
    <div className="relative border border-white/10 overflow-hidden">
      {loading && (
        <div className="absolute inset-0 z-10 bg-[#080808]/90 flex items-center justify-center gap-2 text-xs text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin text-primary" /> Drawing route…
        </div>
      )}
      <div ref={containerRef} className="w-full h-60" aria-label="Trip route map" />
    </div>
  );
}
