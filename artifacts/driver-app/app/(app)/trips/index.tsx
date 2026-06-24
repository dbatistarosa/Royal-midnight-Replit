import { useMemo } from "react";
import { Text, View } from "react-native";
import { format } from "date-fns";
import { useAuthStore } from "@/auth/store";
import { useDriverBookings, useDriverReviews } from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { colors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";

export default function TripsScreen() {
  const driverId = useAuthStore((s) => s.driverId);
  const { data: bookings } = useDriverBookings(driverId);
  const { data: reviews } = useDriverReviews(driverId);

  const past = useMemo(
    () => (bookings ?? []).filter((b) => b.status === "completed" || b.status === "cancelled"),
    [bookings],
  );

  const reviewByBooking = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of reviews ?? []) map.set(r.bookingId, r.rating);
    return map;
  }, [reviews]);

  return (
    <ScreenContainer>
      <Text className="font-serif text-xl text-white pt-4 pb-4">Trip History</Text>

      {past.length === 0 ? (
        <Text className="text-muted text-sm">No completed trips yet.</Text>
      ) : (
        <View className="gap-3">
          {past.map((trip) => {
            const rating = reviewByBooking.get(trip.id);
            return (
              <Card key={trip.id}>
                <View className="flex-row justify-between items-start mb-2">
                  <Text className="text-muted text-xs">{format(new Date(trip.pickupAt), "MMM d, h:mm a")}</Text>
                  <Text className={trip.status === "cancelled" ? "text-danger text-xs" : "text-gold font-sans-medium"}>
                    {trip.status === "cancelled" ? "Cancelled" : `$${(trip.totalPrice ?? trip.driverEarnings).toFixed(2)}`}
                  </Text>
                </View>
                <Text className="text-white text-sm">{trip.pickupAddress}</Text>
                <Text className="text-muted text-xs mt-1">→ {trip.dropoffAddress}</Text>
                {rating ? (
                  <View className="flex-row mt-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Ionicons key={i} name={i < rating ? "star" : "star-outline"} size={14} color={colors.gold} />
                    ))}
                  </View>
                ) : null}
              </Card>
            );
          })}
        </View>
      )}
    </ScreenContainer>
  );
}
