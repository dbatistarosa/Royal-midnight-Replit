import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useBooking,
  useTripChecklist,
  useTripOnWay,
  useTripOnLocation,
  useTripStart,
  useTripComplete,
} from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { GoldButton } from "@/components/GoldButton";
import { colors } from "@/theme/colors";

const STEPS = ["confirmed", "on_way", "on_location", "in_progress", "completed"] as const;
const STEP_LABELS: Record<string, string> = {
  confirmed: "Checklist",
  on_way: "On the Way",
  on_location: "Arrived",
  in_progress: "In Progress",
  completed: "Complete",
};

function callPassenger(phone: string) {
  Linking.openURL(`tel:${phone}`);
}

function openNavigation(address: string) {
  const encoded = encodeURIComponent(address);
  Linking.openURL(`https://maps.apple.com/?daddr=${encoded}`).catch(() =>
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`),
  );
}

export default function TripScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const id = Number(bookingId);
  const { data: booking } = useBooking(id);
  const checklist = useTripChecklist(id);
  const onWay = useTripOnWay(id);
  const onLocation = useTripOnLocation(id);
  const start = useTripStart(id);
  const complete = useTripComplete(id);
  const [error, setError] = useState<string | null>(null);

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
    const total = booking.totalPrice ?? booking.driverEarnings;
    return (
      <ScreenContainer scroll={false}>
        <View className="flex-1 items-center justify-center px-4">
          <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          <Text className="font-serif text-2xl text-white mt-4 mb-1">Trip Complete</Text>
          <Text className="text-muted text-sm mb-6">{booking.passengerName}</Text>
          <Card className="w-full mb-6">
            <View className="flex-row justify-between mb-2">
              <Text className="text-muted text-sm">Earnings</Text>
              <Text className="text-white">${booking.driverEarnings.toFixed(2)}</Text>
            </View>
            {booking.tipAmount ? (
              <View className="flex-row justify-between mb-2">
                <Text className="text-muted text-sm">Tip</Text>
                <Text className="text-success">${booking.tipAmount.toFixed(2)}</Text>
              </View>
            ) : null}
            <View className="flex-row justify-between pt-2 border-t border-border">
              <Text className="text-white font-sans-medium">Total</Text>
              <Text className="font-serif text-gold text-lg">${total.toFixed(2)}</Text>
            </View>
          </Card>
          <GoldButton label="Back to Home" onPress={() => router.replace("/(app)")} />
        </View>
      </ScreenContainer>
    );
  }

  const currentStepIndex = (STEPS as readonly string[]).indexOf(booking.status);

  async function handlePrimaryAction() {
    setError(null);
    try {
      if (booking!.status === "confirmed") {
        if (!booking!.checklistCompletedAt) await checklist.mutateAsync();
        await onWay.mutateAsync();
      } else if (booking!.status === "on_way") {
        await onLocation.mutateAsync();
      } else if (booking!.status === "on_location") {
        await start.mutateAsync();
      } else if (booking!.status === "in_progress") {
        await complete.mutateAsync();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
  }

  const primaryLabel =
    booking.status === "confirmed" ? "Confirm Checklist & On My Way" :
    booking.status === "on_way" ? "Arrived at Pickup" :
    booking.status === "on_location" ? "Start Trip" :
    "Complete Trip";

  const isPending = checklist.isPending || onWay.isPending || onLocation.isPending || start.isPending || complete.isPending;

  return (
    <ScreenContainer>
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

      <Card className="mb-4">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-white font-sans-medium">{booking.passengerName}</Text>
          <Ionicons name="call" size={20} color={colors.gold} onPress={() => callPassenger(booking.passengerPhone)} />
        </View>
        <View className="mb-2">
          <Text className="text-[11px] uppercase text-muted">Pickup</Text>
          <Text className="text-white" onPress={() => openNavigation(booking.pickupAddress)}>{booking.pickupAddress}</Text>
        </View>
        <View>
          <Text className="text-[11px] uppercase text-muted">Drop-off</Text>
          <Text className="text-white" onPress={() => openNavigation(booking.dropoffAddress)}>{booking.dropoffAddress}</Text>
        </View>
      </Card>

      {booking.passengerPreferences ? (
        <Card className="mb-4">
          <Text className="text-[11px] uppercase text-muted mb-2">Passenger Preferences</Text>
          {booking.passengerPreferences.cabinTempF ? (
            <Text className="text-white text-sm mb-1">Cabin: {booking.passengerPreferences.cabinTempF}°F</Text>
          ) : null}
          {booking.passengerPreferences.musicPreference ? (
            <Text className="text-white text-sm mb-1">Music: {booking.passengerPreferences.musicPreference}</Text>
          ) : null}
          {booking.passengerPreferences.preferredBeverage ? (
            <Text className="text-white text-sm mb-1">Beverage: {booking.passengerPreferences.preferredBeverage}</Text>
          ) : null}
          {booking.passengerPreferences.vipNotes ? (
            <Text className="text-gold text-sm mt-1">{booking.passengerPreferences.vipNotes}</Text>
          ) : null}
        </Card>
      ) : null}

      {booking.specialRequests ? (
        <Card className="mb-4">
          <Text className="text-[11px] uppercase text-muted mb-1">Special Requests</Text>
          <Text className="text-white text-sm">{booking.specialRequests}</Text>
        </Card>
      ) : null}

      {error ? <Text className="text-danger text-sm mb-3 text-center">{error}</Text> : null}

      <GoldButton label={primaryLabel} onPress={handlePrimaryAction} loading={isPending} />
    </ScreenContainer>
  );
}
