type ExternalMapsRoute = {
  pickup: string;
  stops: readonly string[];
  dropoff: string;
};

export function buildExternalMapsUrl({ pickup, stops, dropoff }: ExternalMapsRoute): string {
  const params = [
    `api=1`,
    `origin=${encodeURIComponent(pickup)}`,
    `destination=${encodeURIComponent(dropoff)}`,
    `travelmode=driving`,
  ];
  const waypoints = stops.filter(Boolean);
  if (waypoints.length > 0) params.push(`waypoints=${encodeURIComponent(waypoints.join("|"))}`);
  return `https://www.google.com/maps/dir/?${params.join("&")}`;
}
