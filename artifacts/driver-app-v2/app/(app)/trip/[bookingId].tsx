import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useBooking,
  useTripChecklist,
  useTripOnWay,
  useTripOnLocation,
  useTripStart,
  useTripComplete,
  useTripItineraryAction,
  useDriverWorkflowConfig,
  useBookingRouteMap,
} from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { GoldButton } from "@/components/GoldButton";
import { colors } from "@/theme/colors";
import { ScreenTitle, RouteStops } from "@/components/DriverUI";
import { driverPayoutTotal } from "@/theme/driverPresentation";
import { CHECKLIST_ITEMS, formatTripActionError, nextTripAction } from "@/trip/tripActionPresentation";
import { canCompleteHourlyTrip, canGoOnWay, formatOnWayAvailability, minutesUntilPickup } from "@/domain/driverWorkflow";
import { DriverBookingManifest } from "@/components/booking/DriverBookingManifest";
import { HourlyItineraryActions } from "@/components/trip/HourlyItineraryActions";
import { CharterTimer } from "@/components/trip/CharterTimer";
import { returnRouteForTrip } from "@/navigation/returnTarget";

const STEPS = ["confirmed", "on_way", "on_location", "in_progress", "completed"] as const;
const STEP_LABELS: Record<string, string> = {
  confirmed: "Checklist",
  on_way: "On the Way",
  on_location: "Arrived",
  in_progress: "In Progress",
  completed: "Complete",
};

export default function TripScreen() {
  const { bookingId, returnTo } = useLocalSearchParams<{ bookingId: string; returnTo?: string }>();
  const id = Number(bookingId);
  const { data: booking, isError, refetch, isRefetching } = useBooking(id);
  const checklist = useTripChecklist(id);
  const onWay = useTripOnWay(id);
  const onLocation = useTripOnLocation(id);
  const start = useTripStart(id);
  const complete = useTripComplete(id);
  const itineraryAction = useTripItineraryAction(id);
  const { data: workflowConfig } = useDriverWorkflowConfig();
  const { data: routeMap, refetch: refetchRouteMap, isLoading: routeMapLoading } = useBookingRouteMap(Number.isFinite(id) ? id : null);
  const [error, setError] = useState<string | null>(null);
  const [checklistVisible, setChecklistVisible] = useState(false);
  const [checkedChecklistItems, setCheckedChecklistItems] = useState<Set<number>>(new Set());
  const [checklistDoneOverride, setChecklistDoneOverride] = useState<boolean | null>(null);

  useEffect(() => {
    if (booking?.checklistCompletedAt) setChecklistDoneOverride(true);
  }, [booking?.checklistCompletedAt]);

  // isError, not just "!booking": without this, a failed fetch (network blip,
  // a stale bookingId) looked identical to "still loading" forever -- on the
  // one screen that advances an active, paying trip through its stages.
  if (isError) {
    return (
      <ScreenContainer scroll={false}>
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-danger text-sm mb-4 text-center">Could not load this trip. Check your connection.</Text>
          <GoldButton label="Retry" variant="outline" onPress={() => void refetch()} loading={isRefetching} />
        </View>
      </ScreenContainer>
    );
  }

  if (!booking) {
    return (
      <ScreenContainer scroll={false}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted">Loading trip…</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (booking.status === "completed") {
    const total = driverPayoutTotal(booking.driverEarnings, booking.tipAmount);
    return (
      <ScreenContainer>
        <ScreenTitle title="Trip Complete" back backHref={returnRouteForTrip(returnTo)} />
        <View className="items-center px-4 pt-3">
          <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          <Text className="text-muted text-sm mb-6">{booking.passengerName}</Text>
          <View className="w-full"><DriverBookingManifest booking={booking} showEarnings mapUri={routeMap?.available ? routeMap.dataUri : null} mapReason={routeMap?.reason} mapLoading={routeMapLoading} onRetryMap={() => void refetchRouteMap()} /></View>
          <Card className="w-full mb-6">
            <View className="flex-row justify-between"><Text className="text-muted text-sm">Tip</Text><Text className="text-success">${(booking.tipAmount ?? 0).toFixed(2)}</Text></View>
            <View className="flex-row justify-between pt-2 mt-2 border-t border-border"><Text className="text-white font-sans-medium">Total</Text><Text className="font-serif text-gold text-lg">${total.toFixed(2)}</Text></View>
          </Card>
          <GoldButton label="Back to Rides" onPress={() => router.replace(returnRouteForTrip(returnTo) as never)} />
        </View>
      </ScreenContainer>
    );
  }

  if (booking.status === "cancelled") {
    return <ScreenContainer><ScreenTitle title="Cancelled Ride" back backHref={returnRouteForTrip(returnTo)} /><DriverBookingManifest booking={booking} showEarnings mapUri={routeMap?.available ? routeMap.dataUri : null} mapReason={routeMap?.reason} mapLoading={routeMapLoading} onRetryMap={() => void refetchRouteMap()} /><Card><Text className="text-danger font-sans-medium mb-2">This ride was cancelled</Text><RouteStops pickup={booking.pickupAddress} dropoff={booking.dropoffAddress} stops={(booking.itinerary ?? []).filter(stop => stop.kind !== "final").sort((a, b) => a.sequence - b.sequence).map(stop => stop.address)} /><Text className="text-muted text-sm">There are no trip actions available for this booking.</Text><GoldButton label="Back to Rides" variant="outline" onPress={() => router.replace(returnRouteForTrip(returnTo) as never)} /></Card></ScreenContainer>;
  }

  const currentStepIndex = (STEPS as readonly string[]).indexOf(booking.status);
  const checklistDone = checklistDoneOverride ?? !!booking.checklistCompletedAt;

  async function handlePrimaryAction() {
    const currentBooking = booking;
    if (!currentBooking) return;
    setError(null);
    try {
      const action = nextTripAction(currentBooking.status, checklistDone ? currentBooking.checklistCompletedAt ?? "local" : null);
      if (action === "checklist") {
        await checklist.mutateAsync();
        setChecklistDoneOverride(true);
        setChecklistVisible(false);
        setCheckedChecklistItems(new Set());
        await refetch();
      } else if (action === "on_way") {
        const windowBooking = { ...currentBooking, checklistCompletedAt: currentBooking.checklistCompletedAt ?? (checklistDone ? "local" : null) };
        if (workflowConfig && !canGoOnWay(windowBooking, workflowConfig)) {
          const minutes = minutesUntilPickup(currentBooking.pickupAt);
          setError(formatOnWayAvailability(minutes, workflowConfig));
          return;
        }
        await onWay.mutateAsync();
        await refetch();
      } else if (action === "on_location") {
        await onLocation.mutateAsync();
        await refetch();
      } else if (action === "start") {
        await start.mutateAsync();
        await refetch();
      } else if (action === "complete") {
        await complete.mutateAsync();
        await refetch();
      }
    } catch (actionError) {
      setError(formatTripActionError(actionError));
      void refetch();
    }
  }

  async function handleItineraryAction(sequence: number, action: "arrive" | "depart") {
    setError(null);
    try {
      await itineraryAction.mutateAsync({ sequence, action });
      await refetch();
    } catch (actionError) {
      setError(formatTripActionError(actionError));
      void refetch();
    }
  }

  const primaryLabel =
    !checklistDone && booking.status === "confirmed" ? "Complete Pre-Ride Checklist" :
    booking.status === "confirmed" ? "On My Way" :
    booking.status === "on_way" ? "Arrived at Pickup" :
    booking.status === "on_location" ? "Start Trip" :
    booking.charterMode === "hourly" && !canCompleteHourlyTrip(booking.itinerary) ? "Complete Stops First" : "Complete Trip";

  const isPending = checklist.isPending || onWay.isPending || onLocation.isPending || start.isPending || complete.isPending || itineraryAction.isPending;
  const windowBooking = { ...booking, checklistCompletedAt: booking.checklistCompletedAt ?? (checklistDone ? "local" : null) };
  const onWayDisabled = booking.status === "confirmed" && checklistDone && workflowConfig != null && !canGoOnWay(windowBooking, workflowConfig);

  return (
    <ScreenContainer>
      <ScreenTitle title="Active Trip" back backHref={returnRouteForTrip(returnTo)} />
      <Text className="text-muted text-xs text-right mb-3">Trip #{booking.id}</Text>
      <View className="pt-4 pb-4">
        <View className="flex-row justify-between">
          {STEPS.slice(0, 4).map((step, i) => (
            <View key={step} className="flex-1 items-center">
              <View className={`h-2 w-full rounded-full ${i <= currentStepIndex ? "bg-gold" : "bg-border"}`} />
              <Text className={`text-[10px] mt-1 ${i <= currentStepIndex ? "text-gold" : "text-muted"}`}>
                {STEP_LABELS[step]}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <DriverBookingManifest booking={booking} showContact mapUri={routeMap?.available ? routeMap.dataUri : null} mapReason={routeMap?.reason} mapLoading={routeMapLoading} onRetryMap={() => void refetchRouteMap()} />
      {booking.charterMode === "hourly" && booking.status === "in_progress" ? <HourlyItineraryActions stops={booking.itinerary ?? []} loading={itineraryAction.isPending} onAction={handleItineraryAction} /> : null}
      <CharterTimer booking={booking} />

      {error ? <Text className="text-danger text-sm mb-3 text-center">{error}</Text> : null}

      {booking.status === "confirmed" && !checklistDone && checklistVisible ? (
        <Card className="mb-3">
          <Text className="text-gold text-xs uppercase tracking-wide mb-3">Pre-Ride Checklist</Text>
          {CHECKLIST_ITEMS.map((item, index) => {
            const checked = checkedChecklistItems.has(index);
            return (
              <Pressable
                key={item}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                onPress={() => setCheckedChecklistItems((previous) => {
                  const next = new Set(previous);
                  if (next.has(index)) next.delete(index); else next.add(index);
                  return next;
                })}
                className="flex-row items-center py-2"
              >
                <View className={`h-5 w-5 rounded border mr-3 items-center justify-center ${checked ? "bg-gold border-gold" : "border-muted"}`}>
                  {checked ? <Text className="text-background text-xs">✓</Text> : null}
                </View>
                <Text className="text-white text-sm flex-1">{item}</Text>
              </Pressable>
            );
          })}
          <GoldButton
            label="Confirm Checklist"
            onPress={handlePrimaryAction}
            loading={isPending}
            disabled={checkedChecklistItems.size !== CHECKLIST_ITEMS.length}
          />
          <View className="h-2" />
          <GoldButton label="Cancel" variant="outline" onPress={() => setChecklistVisible(false)} disabled={isPending} />
        </Card>
      ) : currentStepIndex >= 0 ? (
        <View>
          {onWayDisabled && workflowConfig ? <Text className="text-muted text-xs text-center mb-3">{formatOnWayAvailability(minutesUntilPickup(booking.pickupAt), workflowConfig)}</Text> : null}
          <GoldButton
            label={primaryLabel}
            onPress={() => {
              if (booking.status === "confirmed" && !checklistDone) {
                setChecklistVisible(true);
                setError(null);
                return;
              }
              void handlePrimaryAction();
            }}
            loading={isPending}
            disabled={onWayDisabled || primaryLabel === "Complete Stops First"}
          />
        </View>
      ) : <Text className="text-muted text-sm text-center">This trip is not ready to start.</Text>}
    </ScreenContainer>
  );
}
