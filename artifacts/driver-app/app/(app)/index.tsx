import { useMemo } from "react";
import { Pressable, RefreshControl, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/auth/store";
import {
  useDriverByUserId,
  useDriverEarnings,
  useDriverBookings,
  useOpenPoolBookings,
  usePatchDriverStatus,
} from "@/api/hooks";
import { useLocationSharing } from "@/location/useLocationSharing";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { colors } from "@/theme/colors";

const ACTIVE_TRIP_STATUSES = new Set(["confirmed", "on_way", "on_location", "in_progress"]);

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const driverId = useAuthStore((s) => s.driverId);
  const { data: driver, refetch: refetchDriver } = useDriverByUserId(user?.id ?? null);
  const { data: earnings, refetch: refetchEarnings } = useDriverEarnings(driverId);
  const { data: openPool, refetch: refetchOpenPool, isFetching: poolFetching } = useOpenPoolBookings();
  const { data: myBookings, refetch: refetchMine } = useDriverBookings(driverId);
  const patchStatus = usePatchDriverStatus(driverId ?? 0);
  const { start: startLocation, stop: stopLocation } = useLocationSharing();

  const activeTrip = useMemo(
    () => myBookings?.find((b) => ACTIVE_TRIP_STATUSES.has(b.status)),
    [myBookings],
  );

  const isOnline = driver?.status === "available";

  async function handleToggleOnline(next: boolean) {
    if (next) {
      const ok = await startLocation();
      if (!ok) return;
      await patchStatus.mutateAsync("available");
    } else {
      await stopLocation();
      await patchStatus.mutateAsync("unavailable");
    }
    refetchDriver();
  }

  function refreshAll() {
    refetchDriver();
    refetchEarnings();
    refetchOpenPool();
    refetchMine();
  }

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={poolFetching} onRefresh={refreshAll} tintColor={colors.gold} />}>
      <View className="flex-row items-center justify-between pt-4 pb-6">
        <Text className="font-serif text-xl text-gold">ROYAL MIDNIGHT</Text>
        <View className="flex-row items-center gap-2">
          <View className={`h-2 w-2 rounded-full ${isOnline ? "bg-success" : "bg-muted"}`} />
          <Text className="text-xs uppercase tracking-wide text-white">{isOnline ? "Online" : "Offline"}</Text>
          <Switch
            value={isOnline}
            onValueChange={handleToggleOnline}
            trackColor={{ true: colors.gold, false: colors.border }}
            thumbColor={colors.background}
          />
        </View>
      </View>

      <View className="flex-row gap-3 mb-6">
        <StatTile label="Today" value={`$${(earnings?.today ?? 0).toFixed(2)}`} />
        <StatTile label="This Week" value={`$${(earnings?.thisWeek ?? 0).toFixed(2)}`} />
        <StatTile label="Rides" value={String(earnings?.totalRides ?? 0)} />
      </View>

      {activeTrip ? (
        <Pressable onPress={() => router.push(`/trip/${activeTrip.id}`)} className="mb-6">
          <Card className="border-gold">
            <Text className="text-[11px] uppercase tracking-wider text-gold mb-2">Active Trip</Text>
            <Text className="text-white font-sans-medium">{activeTrip.pickupAddress}</Text>
            <Text className="text-muted text-xs mt-1">→ {activeTrip.dropoffAddress}</Text>
            <Text className="text-gold text-xs mt-3 uppercase tracking-wide">Tap to continue →</Text>
          </Card>
        </Pressable>
      ) : null}

      <Text className="font-serif text-base text-white mb-3">Available Rides</Text>
      {!isOnline ? (
        <Text className="text-muted text-sm">Go online to see available rides.</Text>
      ) : !openPool || openPool.length === 0 ? (
        <Text className="text-muted text-sm">No rides available right now.</Text>
      ) : (
        <View className="gap-3">
          {openPool.map((booking) => (
            <Pressable key={booking.id} onPress={() => router.push(`/offer/${booking.id}`)}>
              <Card>
                <Text className="text-white text-sm">{booking.pickupAddress}</Text>
                <Text className="text-muted text-xs mt-1">→ {booking.dropoffAddress}</Text>
                <Text className="text-gold font-sans-medium mt-2">${booking.driverEarnings?.toFixed(2)}</Text>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
