import { useMemo } from "react";
import { Alert, Image, Pressable, RefreshControl, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
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
import { applyOnlineTransition } from "@/location/locationLifecycle";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { colors } from "@/theme/colors";
import { EmptyState, RouteStops } from "@/components/DriverUI";
import { buildTripHref } from "@/navigation/returnTarget";
import { serviceLabel } from "@/domain/driverBooking";
import { canChangeAvailability, displayDriverStatus } from "@/domain/driverStatus";

const TRIP_CARD_STATUSES = new Set(["confirmed", "on_way", "on_location", "in_progress"]);
const LIVE_TRIP_STATUSES = new Set(["on_way", "on_location", "in_progress"]);

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const driverId = useAuthStore((s) => s.driverId);
  const { data: driver, refetch: refetchDriver } = useDriverByUserId(user?.id ?? null);
  const { data: earnings, refetch: refetchEarnings, isError: earningsError } = useDriverEarnings(driverId);
  const { data: openPool, refetch: refetchOpenPool, isFetching: poolFetching, isError: poolError, isLoading: poolLoading } = useOpenPoolBookings();
  const { data: myBookings, refetch: refetchMine, isError: bookingsError } = useDriverBookings(driverId);
  const patchStatus = usePatchDriverStatus(driverId ?? 0);
  const { start: startLocation, stop: stopLocation } = useLocationSharing();

  const activeTrip = useMemo(
    () => myBookings?.find((b) => TRIP_CARD_STATUSES.has(b.status)),
    [myBookings],
  );
  const liveTrip = useMemo(
    () => myBookings?.find((b) => LIVE_TRIP_STATUSES.has(b.status)),
    [myBookings],
  );

  const isOnline = driver?.status === "available" || driver?.status === "active" || Boolean(liveTrip);
  const currentStatus = displayDriverStatus(driver?.status, Boolean(liveTrip));
  const currentStatusLabel = currentStatus === "on_duty"
    ? "On Duty"
    : currentStatus === "on_break"
      ? "On Break"
      : currentStatus === "available"
        ? "Available"
        : "Unavailable";

  async function handleToggleOnline(next: boolean) {
    // isOnline is bound to driver?.status, not to a separate optimistic flag —
    // but the Switch is a native control, and on a failed mutateAsync (thrown,
    // previously uncaught) the OS-level switch can visually settle on the
    // position the driver dragged it to before JS ever confirms it, out of
    // sync with the untouched server status underneath. Catching the error,
    // alerting, and always refetching (success or failure) forces a fresh
    // render from the real status either way.
    try {
      if (!next && liveTrip) {
        Alert.alert("Live trip in progress", "Finish the active trip before going unavailable.");
        return;
      }
      if (next) {
        const ok = await applyOnlineTransition({
          startLocation,
          stopLocation,
          setStatus: (status) => patchStatus.mutateAsync(status).then(() => undefined),
        });
        if (!ok) return;
      } else {
        await stopLocation();
        await patchStatus.mutateAsync("unavailable");
      }
    } catch {
      Alert.alert("Couldn't update status", "Please check your connection and try again.");
    } finally {
      refetchDriver();
    }
  }

  async function handleStatusChoice(status: "available" | "on_break" | "unavailable") {
    if (!canChangeAvailability(status, Boolean(liveTrip))) {
      Alert.alert("Live trip in progress", "Finish the active trip before taking a break or going unavailable.");
      return;
    }
    try {
      if (status === "available") {
        const ok = await applyOnlineTransition({ startLocation, stopLocation, setStatus: (nextStatus) => patchStatus.mutateAsync(nextStatus).then(() => undefined) });
        if (!ok) return;
      } else {
        await stopLocation();
        await patchStatus.mutateAsync(status);
      }
    } catch {
      Alert.alert("Couldn't update status", "Please check your connection and try again.");
    } finally {
      refetchDriver();
    }
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
        <View className="flex-row items-center gap-2"><Image source={require("../../assets/royal-midnight-logo-transparent.png")} style={{ width: 116, height: 42, resizeMode: "contain" }} accessibilityLabel="Royal Midnight logo" /></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => router.push("/(app)/notifications")} className="p-3"><Ionicons name="notifications-outline" size={23} color={colors.gold} /></Pressable>
      </View>
      <Text className="font-sans-medium text-xl text-white">Hello, {(driver?.name || user?.name || "Driver").split(" ")[0]}</Text>
      <Text className="font-sans text-sm text-muted mt-1 mb-5">Ready for what's next?</Text>
      <View className={`flex-row items-center justify-between rounded-xl border px-4 mb-4 ${isOnline ? "border-success bg-surface" : "border-border bg-surface"}`}>
        <View className="flex-row items-center gap-3">
          <Ionicons name="radio" size={24} color={isOnline ? colors.success : colors.muted} />
          <Text className="font-sans-medium text-base text-white">{currentStatusLabel}</Text>
        </View>
          <Switch
            accessibilityLabel={`Driver status: ${currentStatusLabel}`}
            disabled={patchStatus.isPending}
            value={isOnline}
            onValueChange={handleToggleOnline}
            trackColor={{ true: "#16a995", false: colors.border }}
            thumbColor={colors.white}
          />
      </View>

      {currentStatus === "on_duty" ? <View className="rounded-lg border border-blue-400/40 bg-blue-400/10 px-3 py-2 mb-2"><Text className="text-blue-300 text-xs text-center uppercase">On Duty — active trip in progress</Text></View> : null}
      <View className="flex-row gap-2 mb-5">
        {(["available", "on_break", "unavailable"] as const).map((status) => (
          <Pressable
            key={status}
            accessibilityRole="button"
            accessibilityState={{ selected: currentStatus === status, disabled: !canChangeAvailability(status, Boolean(liveTrip)) }}
            disabled={patchStatus.isPending || !canChangeAvailability(status, Boolean(liveTrip))}
            onPress={() => void handleStatusChoice(status)}
            className={`flex-1 rounded-lg border px-2 py-3 items-center ${currentStatus === status ? "border-gold bg-surface" : "border-border bg-background"} ${liveTrip && status !== "available" ? "opacity-40" : ""}`}
          >
            <Text className={`text-[10px] uppercase ${currentStatus === status ? "text-gold" : "text-muted"}`}>{status === "available" ? "Available" : status === "on_break" ? "On Break" : "Unavailable"}</Text>
          </Pressable>
        ))}
      </View>

      {earningsError ? <View className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 mb-3"><Text className="text-warning text-xs">Earnings could not be refreshed. Pull down to retry.</Text></View> : null}
      {bookingsError ? <View className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 mb-3"><Text className="text-warning text-xs">Your active trip status could not be refreshed. Pull down to retry.</Text></View> : null}

      <View className="flex-row gap-3 mb-6">
        <StatTile label="Today" value={`$${(earnings?.today ?? 0).toFixed(2)}`} />
        <StatTile label="This Week" value={`$${(earnings?.thisWeek ?? 0).toFixed(2)}`} />
        <StatTile label="Rides" value={String(earnings?.totalRides ?? 0)} />
      </View>

      {activeTrip ? (
        <Pressable onPress={() => router.push(buildTripHref(activeTrip.id, "home") as never)} className="mb-6">
          <Card className="border-gold">
            <Text className="text-[11px] uppercase tracking-wider text-gold mb-2">Active Trip</Text>
            <RouteStops pickup={activeTrip.pickupAddress} dropoff={activeTrip.dropoffAddress} stops={(activeTrip.itinerary ?? []).filter(stop => stop.kind !== "final").sort((a, b) => a.sequence - b.sequence).map(stop => stop.address)} />
            <Text className="text-gold text-xs mt-3 uppercase tracking-wide">Tap to continue →</Text>
          </Card>
        </Pressable>
      ) : null}

      <View className="flex-row justify-between items-center mb-3"><Text className="font-sans-medium text-base text-white">Available Rides</Text><Pressable accessibilityRole="button" onPress={() => router.push("/(app)/trips")}><Text className="text-gold text-xs py-2">My rides →</Text></Pressable></View>
      {!isOnline ? (
        <EmptyState title="You're offline" message="Go online when you're ready to receive ride offers." />
      ) : poolError ? (
        <EmptyState title="Couldn't load ride offers" message="Check your connection and try again." onRetry={() => void refetchOpenPool()} />
      ) : poolLoading ? (
        <EmptyState loading title="Finding ride offers" message="Checking available rides in your area." />
      ) : !openPool || openPool.length === 0 ? (
        <EmptyState title="Ready for your next ride" message="New offers will appear here. Your availability is on." />
      ) : (
        <View className="gap-3">
          {openPool.map((booking) => (
            <Pressable key={booking.id} onPress={() => router.push(`/offer/${booking.id}?returnTo=home` as never)}>
              <Card>
                <View className="flex-row items-start justify-between"><Text className="text-white font-sans-medium text-sm flex-1">{serviceLabel(booking)}</Text><View className="items-end"><Text className="text-gold font-serif text-xl">${booking.driverEarnings?.toFixed(2)}</Text><Text className="text-muted text-[10px]">Est. earnings</Text></View></View>
                <RouteStops pickup={booking.pickupAddress} dropoff={booking.dropoffAddress} stops={(booking.itinerary ?? []).filter(stop => stop.kind !== "final").sort((a, b) => a.sequence - b.sequence).map(stop => stop.address)} />
                <View className="flex-row items-center gap-2 border-t border-border pt-3"><Ionicons name="time-outline" size={14} color={colors.gold} /><Text className="text-muted text-xs">{format(new Date(booking.pickupAt), "MMM d, h:mm a")}</Text></View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
