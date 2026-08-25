import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ApiError } from "@workspace/api-client-react";
import { useAuthStore } from "@/auth/store";
import { useBooking, useAcceptBooking, useDriverVehicles } from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { GoldButton } from "@/components/GoldButton";
import { colors } from "@/theme/colors";

const OFFER_WINDOW_SECONDS = 25;

export default function OfferScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const id = Number(bookingId);
  const { data: booking, isLoading, isError, refetch, isRefetching } = useBooking(id);
  const acceptBooking = useAcceptBooking();
  const driverId = useAuthStore((s) => s.driverId);
  const { data: vehicles } = useDriverVehicles(driverId);
  const [secondsLeft, setSecondsLeft] = useState(OFFER_WINDOW_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);

  // Paused while an accept is in flight: without this, the countdown could
  // hit 0 and call router.back() right as acceptWithVehicle's still-pending
  // mutation was about to router.replace() to the trip screen on top of
  // whatever the pop-back revealed underneath -- a flicker/double-navigation.
  useEffect(() => {
    if (acceptBooking.isPending) return;
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
  }, [acceptBooking.isPending]);

  async function acceptWithVehicle(vehicleId?: number) {
    setError(null);
    setShowVehiclePicker(false);
    try {
      await acceptBooking.mutateAsync({ bookingId: id, vehicleId });
      router.replace(`/trip/${id}`);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409
        ? "This ride was already taken by another driver."
        : "Could not accept this ride. Please try again.");
    }
  }

  function handleAccept() {
    // Mirror the web dashboard: 2+ vehicles → pick which one; 0–1 → accept
    // immediately (sending the single vehicle's id when there is one).
    if (vehicles && vehicles.length > 1) {
      setShowVehiclePicker(true);
      return;
    }
    void acceptWithVehicle(vehicles?.[0]?.id);
  }

  if (isError) {
    return (
      <ScreenContainer scroll={false}>
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-danger text-sm mb-4 text-center">Could not load this offer. Check your connection.</Text>
          <GoldButton label="Retry" variant="outline" onPress={() => void refetch()} loading={isRefetching} />
        </View>
      </ScreenContainer>
    );
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

      {/* Vehicle picker — shown when the driver has more than one vehicle */}
      <Modal visible={showVehiclePicker} transparent animationType="fade" onRequestClose={() => setShowVehiclePicker(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", padding: 24 }}>
          <Card>
            <Text className="text-white font-sans-medium text-base mb-3">Which vehicle will you use?</Text>
            {(vehicles ?? []).map((v) => (
              <Pressable
                key={v.id}
                onPress={() => void acceptWithVehicle(v.id)}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  paddingVertical: 12, paddingHorizontal: 12, marginBottom: 8,
                  borderWidth: 1, borderColor: v.isDefault ? colors.gold : "#333",
                  borderRadius: 4, backgroundColor: colors.surface,
                }}
              >
                <View>
                  <Text style={{ color: colors.white, fontSize: 14 }}>
                    {v.year} {v.make} {v.model}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {[v.color, v.regPlate].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                {v.isDefault ? <Text style={{ color: colors.gold, fontSize: 11 }}>Default</Text> : null}
              </Pressable>
            ))}
            <Pressable onPress={() => setShowVehiclePicker(false)} style={{ alignItems: "center", paddingVertical: 10 }}>
              <Text style={{ color: colors.muted }}>Cancel</Text>
            </Pressable>
          </Card>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
