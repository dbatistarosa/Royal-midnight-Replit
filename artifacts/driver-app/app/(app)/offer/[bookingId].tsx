import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ApiError } from "@workspace/api-client-react";
import { useBooking, useAcceptBooking } from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { GoldButton } from "@/components/GoldButton";

const OFFER_WINDOW_SECONDS = 25;

export default function OfferScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const id = Number(bookingId);
  const { data: booking, isLoading } = useBooking(id);
  const acceptBooking = useAcceptBooking();
  const [secondsLeft, setSecondsLeft] = useState(OFFER_WINDOW_SECONDS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          router.back();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleAccept() {
    setError(null);
    try {
      await acceptBooking.mutateAsync(id);
      router.replace(`/trip/${id}`);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409
        ? "This ride was already taken by another driver."
        : "Could not accept this ride. Please try again.");
    }
  }

  if (isLoading || !booking) {
    return (
      <ScreenContainer scroll={false}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted">Loading offer…</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll={false}>
      <View className="flex-1 justify-center">
        <View className="items-center mb-8">
          <View className="h-20 w-20 rounded-full border-4 border-gold items-center justify-center mb-4">
            <Text className="text-gold font-serif text-2xl">{secondsLeft}s</Text>
          </View>
          <Text className="text-muted text-xs uppercase tracking-wider">New Ride Offer</Text>
        </View>

        <Card className="mb-6">
          <View className="mb-3">
            <Text className="text-[11px] uppercase text-muted">Pickup</Text>
            <Text className="text-white">{booking.pickupAddress}</Text>
          </View>
          <View className="mb-3">
            <Text className="text-[11px] uppercase text-muted">Drop-off</Text>
            <Text className="text-white">{booking.dropoffAddress}</Text>
          </View>
          <View className="flex-row justify-between items-center mt-2 pt-3 border-t border-border">
            <Text className="text-muted text-xs">Estimated earnings</Text>
            <Text className="font-serif text-xl text-gold">${booking.driverEarnings.toFixed(2)}</Text>
          </View>
        </Card>

        {error ? <Text className="text-danger text-sm mb-3 text-center">{error}</Text> : null}

        <View className="gap-3">
          <GoldButton label="Accept Ride" onPress={handleAccept} loading={acceptBooking.isPending} />
          <GoldButton label="Decline" variant="outline" onPress={() => router.back()} />
        </View>
      </View>
    </ScreenContainer>
  );
}
