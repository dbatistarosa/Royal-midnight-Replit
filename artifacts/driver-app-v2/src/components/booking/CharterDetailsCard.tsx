import { Text, View } from "react-native";
import { Card } from "@/components/Card";
import type { DriverBooking } from "@/api/types";

export function CharterDetailsCard({ booking }: { booking: DriverBooking }) {
  if (booking.charterMode !== "hourly") return null;
  return <Card className="mb-4">
    <Text className="text-[11px] uppercase text-muted mb-2">Hourly Charter</Text>
    <View className="flex-row flex-wrap gap-x-4 gap-y-1 mb-2">
      {booking.charterHours != null ? <Text className="text-white text-sm">{booking.charterHours} contracted hours</Text> : null}
      {(booking.includedMilesPerHour ?? booking.maxMilesPerHour) != null ? <Text className="text-white text-sm">{booking.includedMilesPerHour ?? booking.maxMilesPerHour} mi/hr included</Text> : null}
    </View>
    <Text className="text-muted text-xs">20-minute grace period; additional time is billed by full hour.</Text>
    {booking.itinerary?.map((stop) => <View key={stop.id} className="border-t border-border mt-3 pt-2"><Text className="text-white text-sm">{stop.kind === "final" ? "Final destination" : `Stop ${stop.sequence + 1}`}</Text><Text className="text-muted text-xs mt-1">{stop.address}</Text><Text className={`text-xs mt-1 ${stop.departedAt ? "text-success" : stop.arrivedAt ? "text-gold" : "text-muted"}`}>{stop.departedAt ? "Departed" : stop.arrivedAt ? "Arrived" : "Pending"}</Text></View>)}
  </Card>;
}
