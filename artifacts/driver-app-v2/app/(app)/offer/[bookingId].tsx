import { useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ApiError } from "@/api/client";
import { useAuthStore } from "@/auth/store";
import { useOpenPoolBooking, useAcceptBooking, useDriverVehicles, useBookingRouteMap } from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { GoldButton } from "@/components/GoldButton";
import { colors } from "@/theme/colors";
import { ScreenTitle } from "@/components/DriverUI";
import { Ionicons } from "@expo/vector-icons";
import { DriverBookingManifest } from "@/components/booking/DriverBookingManifest";
import { filterCompatibleVehicles } from "@/domain/driverBooking";
import { formatTripActionError } from "@/trip/tripActionPresentation";
import { returnRouteForTrip } from "@/navigation/returnTarget";

export default function OfferScreen() {
  const { bookingId, returnTo } = useLocalSearchParams<{ bookingId: string; returnTo?: string }>();
  const id = Number(bookingId);
  const { data: booking, isLoading, isError, isSuccess, refetch, isRefetching } = useOpenPoolBooking(id);
  const acceptBooking = useAcceptBooking();
  const driverId = useAuthStore((s) => s.driverId);
  const { data: vehicles, isLoading: vehiclesLoading, isError: vehiclesError, refetch: refetchVehicles } = useDriverVehicles(driverId);
  const { data: routeMap, refetch: refetchRouteMap, isLoading: routeMapLoading } = useBookingRouteMap(Number.isFinite(id) ? id : null);
  const [error, setError] = useState<string | null>(null);
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const compatibleVehicles = useMemo(
    () => booking && vehicles ? filterCompatibleVehicles(vehicles, booking) : [],
    [booking, vehicles],
  );

  async function acceptWithVehicle(vehicleId?: number) {
    setError(null);
    setShowVehiclePicker(false);
    try {
      await acceptBooking.mutateAsync({ bookingId: id, vehicleId });
      router.replace(`/trip/${id}?returnTo=${encodeURIComponent(returnTo === "alerts" ? "alerts" : "home")}` as never);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409
        ? "This ride was already taken by another driver."
        : formatTripActionError(err));
    }
  }

  function handleAccept() {
    if (vehiclesLoading || vehiclesError) {
      setError(vehiclesError ? "Your registered vehicles could not be loaded. Retry before accepting this ride." : "Loading your registered vehicles…");
      return;
    }
    if (!compatibleVehicles.length) {
      setError("No registered vehicle matches this ride's class and capacity requirements.");
      return;
    }
    // Mirror the web dashboard: 2+ vehicles → pick which one; 0–1 → accept
    // immediately (sending the single vehicle's id when there is one).
    if (compatibleVehicles.length > 1) {
      setShowVehiclePicker(true);
      return;
    }
    void acceptWithVehicle(compatibleVehicles[0]?.id);
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

  if (isSuccess && !booking) {
    return (
      <ScreenContainer scroll={false}>
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-muted text-sm mb-4 text-center">This ride is no longer available. Another chauffeur may have accepted it.</Text>
      <GoldButton label="Back to available rides" variant="outline" onPress={() => router.replace(returnRouteForTrip(returnTo) as never)} />
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
    <ScreenContainer>
      <ScreenTitle title="New Ride Offer" back backHref={returnRouteForTrip(returnTo)} />
      <View className="flex-1">
        <DriverBookingManifest booking={booking} showEarnings mapUri={routeMap?.available ? routeMap.dataUri : null} mapReason={routeMap?.reason} mapLoading={routeMapLoading} onRetryMap={() => void refetchRouteMap()} />

        <Text className="text-white font-sans-medium text-sm mb-3">Compatible Vehicle</Text>
        <Card className="mb-5 flex-row gap-3 items-center"><Ionicons name="car-sport" size={25} color={colors.gold} /><Text className="text-white text-sm flex-1">{vehiclesLoading ? "Loading registered vehicles…" : vehiclesError ? "Vehicle information unavailable" : compatibleVehicles.length === 1 ? `${compatibleVehicles[0].year} ${compatibleVehicles[0].make} ${compatibleVehicles[0].model}` : compatibleVehicles.length > 1 ? "Choose a compatible vehicle when accepting" : "No compatible registered vehicle"}</Text></Card>
        {vehiclesError ? <View className="mb-3 items-center"><Text className="text-danger text-sm text-center mb-2">Your vehicle list could not be loaded.</Text><Pressable onPress={() => void refetchVehicles()}><Text className="text-gold text-sm">Retry vehicle list</Text></Pressable></View> : !vehiclesLoading && !compatibleVehicles.length ? <Text className="text-danger text-sm mb-3 text-center">Add or update a vehicle with the required class, passenger capacity and luggage capacity before accepting.</Text> : null}

        {error ? <Text className="text-danger text-sm mb-3 text-center">{error}</Text> : null}

        <View className="gap-3">
          <GoldButton label="Accept Ride" onPress={handleAccept} loading={acceptBooking.isPending || vehiclesLoading} disabled={!compatibleVehicles.length || vehiclesLoading || vehiclesError} />
          <GoldButton label="Decline" variant="outline" onPress={() => router.replace(returnRouteForTrip(returnTo) as never)} />
        </View>
      </View>

      {/* Vehicle picker — shown when the driver has more than one vehicle */}
      <Modal visible={showVehiclePicker} transparent animationType="fade" onRequestClose={() => setShowVehiclePicker(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", padding: 24 }}>
          <Card>
            <Text className="text-white font-sans-medium text-base mb-3">Which vehicle will you use?</Text>
            {compatibleVehicles.map((v) => (
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
