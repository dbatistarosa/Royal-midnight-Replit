import { useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { format } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/auth/store";
import { useDriverBookings } from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { ScreenTitle, Segments, EmptyState, RouteStops } from "@/components/DriverUI";
import { filterRides, type RideTab } from "@/theme/driverPresentation";
import { colors } from "@/theme/colors";
import { buildTripHref, isTripReturnTarget, type TripReturnTarget } from "@/navigation/returnTarget";

const TABS = [{ key: "upcoming", label: "Upcoming" }, { key: "completed", label: "Completed" }, { key: "cancelled", label: "Cancelled" }] as const;
export default function TripsScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const driverId = useAuthStore(s => s.driverId);
  const { data, isLoading, isError, refetch, isRefetching } = useDriverBookings(driverId);
  const [tab, setTab] = useState<RideTab>(() => isTripReturnTarget(params.tab) && params.tab !== "home" && params.tab !== "alerts" ? params.tab as RideTab : "upcoming");
  const [search, setSearch] = useState("");
  const rides = useMemo(() => filterRides(data ?? [], tab, search), [data, tab, search]);
  return <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.gold} />}>
    <ScreenTitle title="My Rides" />
    <Segments options={TABS} value={tab} onChange={setTab} />
    <View className="flex-row items-center rounded-xl border border-border bg-surface px-3 mb-5 gap-2">
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput accessibilityLabel="Search rides" placeholder="Search pickup or destination…" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} className="flex-1 text-white font-sans py-3 text-sm" />
      {search ? <Pressable accessibilityLabel="Clear search" onPress={() => setSearch("")} hitSlop={10}><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable> : null}
    </View>
    {isError ? <EmptyState title="Couldn't load rides" message="Check your connection and try again." onRetry={() => void refetch()} /> : isLoading ? <EmptyState loading title="Loading your rides" message="Retrieving your latest bookings." /> : rides.length === 0 ? <EmptyState title={search ? "No matching rides" : "No " + tab + " rides"} message={search ? "Try another pickup or destination." : "Your rides will appear here as their status changes."} /> :
      <View className="gap-3">{rides.map(ride => <Pressable key={ride.id} accessibilityRole="button" accessibilityLabel={"Open ride " + ride.id} onPress={() => router.push(buildTripHref(ride.id, tab as TripReturnTarget) as never)}>
        <Card>
          <View className="flex-row justify-between items-center gap-2">
            <View className="flex-row items-center gap-2 flex-1"><Ionicons name="calendar-outline" size={15} color={colors.gold} /><Text className="text-muted text-xs">{format(new Date(ride.pickupAt), "MMM d, h:mm a")}</Text></View>
            <View className="rounded-md bg-background px-2 py-1"><Text className={tab === "cancelled" ? "text-danger text-xs" : "text-gold text-xs"}>{tab === "upcoming" ? "Upcoming" : tab === "completed" ? "Completed" : "Cancelled"}</Text></View>
          </View>
          <RouteStops pickup={ride.pickupAddress} dropoff={ride.dropoffAddress} stops={(ride.itinerary ?? []).filter(stop => stop.kind !== "final").sort((a, b) => a.sequence - b.sequence).map(stop => stop.address)} />
          <View className="flex-row justify-between items-center border-t border-border pt-3"><Text className="text-muted text-xs">{ride.vehicleClass?.replace(/_/g, " ") || "Chauffeur service"}</Text><View className="flex-row items-center gap-2"><Text className="text-gold font-sans-medium">${Number(ride.driverEarnings ?? 0).toFixed(2)}</Text><Ionicons name="chevron-forward" size={16} color={colors.muted} /></View></View>
        </Card>
      </Pressable>)}</View>}
  </ScreenContainer>;
}
