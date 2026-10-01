import { Alert, Image, Linking, Pressable, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { RouteStops } from "@/components/DriverUI";
import type { DriverBooking } from "@/api/types";
import { buildExternalMapsUrl } from "@/domain/routeUrl";

export function RouteMapCard({ booking, mapUri, mapReason, mapLoading = false, onRetry }: { booking: DriverBooking; mapUri?: string | null; mapReason?: string; mapLoading?: boolean; onRetry?: () => void }) {
  const stops = (booking.itinerary ?? [])
    .filter((stop) => stop.kind !== "final")
    .sort((a, b) => a.sequence - b.sequence)
    .map((stop) => stop.address);

  async function openRoute() {
    const destination = buildExternalMapsUrl({ pickup: booking.pickupAddress, stops, dropoff: booking.dropoffAddress });
    try {
      if (!(await Linking.canOpenURL(destination))) throw new Error("No maps app is available");
      await Linking.openURL(destination);
    } catch {
      Alert.alert("Maps unavailable", "Your phone could not open a maps application.");
    }
  }
  return (
    <Card className="mb-4">
      <Text className="text-[11px] uppercase text-muted mb-1">Route</Text>
      {mapUri ? <Image source={{ uri: mapUri }} accessibilityLabel="Trip route map" className="w-full h-36 rounded-lg mb-2" resizeMode="cover" /> : null}
      <RouteStops pickup={booking.pickupAddress} dropoff={booking.dropoffAddress} stops={stops} />
      {mapLoading ? <Text className="text-muted text-xs">Loading map…</Text> : !mapUri && onRetry ? <Text className="text-gold text-xs" onPress={onRetry}>{mapReason === "mapbox_not_configured" ? "Map service is not configured — retry" : mapReason === "geocode_failed" ? "Could not locate one of the addresses — retry" : "Map unavailable — retry"}</Text> : null}
      {booking.estimatedDistanceMiles != null || booking.estimatedDurationMinutes != null ? (
        <View className="flex-row gap-4 border-t border-border pt-3">
          {booking.estimatedDistanceMiles != null ? <Text className="text-muted text-xs">{booking.estimatedDistanceMiles.toFixed(1)} mi</Text> : null}
          {booking.estimatedDurationMinutes != null ? <Text className="text-muted text-xs">{Math.round(booking.estimatedDurationMinutes)} min</Text> : null}
        </View>
      ) : null}
      <Pressable accessibilityRole="button" onPress={() => void openRoute()} className="mt-3 rounded-md border border-gold px-3 py-2"><Text className="text-gold text-xs text-center">Open route in Maps</Text></Pressable>
    </Card>
  );
}
