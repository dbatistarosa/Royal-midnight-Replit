import { Alert, Linking, Pressable, Text, View } from "react-native";
import { format } from "date-fns";
import type { DriverBooking } from "@/api/types";
import { Card } from "@/components/Card";
import { serviceLabel } from "@/domain/driverBooking";
import { RouteMapCard } from "@/components/booking/RouteMapCard";
import { PassengerPreferencesCard } from "@/components/booking/PassengerPreferencesCard";
import { CharterDetailsCard } from "@/components/booking/CharterDetailsCard";
import { TripExtrasCard } from "@/components/booking/TripExtrasCard";
import { colors } from "@/theme/colors";

export function DriverBookingManifest({ booking, mapUri, mapReason, mapLoading = false, onRetryMap, showEarnings = false, showContact = false }: { booking: DriverBooking; mapUri?: string | null; mapReason?: string; mapLoading?: boolean; onRetryMap?: () => void; showEarnings?: boolean; showContact?: boolean }) {
  async function callPassenger() {
    const phone = booking.passengerPhone?.trim();
    if (!phone) {
      Alert.alert("No phone number", "This passenger does not have a phone number on file.");
      return;
    }
    try {
      const url = `tel:${phone}`;
      if (!(await Linking.canOpenURL(url))) throw new Error("Phone unavailable");
      await Linking.openURL(url);
    } catch {
      Alert.alert("Calling unavailable", "Your phone could not start a call.");
    }
  }
  return <View>
    <Card className="mb-4">
      <View className="flex-row justify-between items-start"><View className="flex-1"><Text className="text-gold text-xs uppercase tracking-wide">{serviceLabel(booking)}</Text><Text className="text-white font-sans-medium text-lg mt-1">{booking.pickupAt ? format(new Date(booking.pickupAt), "MMM d, yyyy · h:mm a") : "Scheduled ride"}</Text></View><Text className="text-muted text-xs">Trip #{booking.id}</Text></View>
      <View className="flex-row gap-4 mt-4"><Text className="text-muted text-xs">{booking.passengers} passengers</Text><Text className="text-muted text-xs">{booking.luggageCount} bags</Text>{booking.vehicleClass ? <Text className="text-muted text-xs">{booking.vehicleClass.replace(/_/g, " ")}</Text> : null}</View>
      {booking.flightNumber ? <Text className="text-white text-sm mt-3">Flight {booking.flightNumber}</Text> : null}
      {showContact && booking.passengerName ? <View className="flex-row items-center gap-3 mt-3"><Text className="text-white text-sm flex-1">{booking.passengerName}{booking.passengerPhone ? ` · ${booking.passengerPhone}` : ""}</Text><Pressable accessibilityRole="button" accessibilityLabel="Call passenger" onPress={() => void callPassenger()} className="rounded-full border border-gold p-2"><Text className="text-gold text-xs">Call</Text></Pressable></View> : null}
      {booking.specialRequests ? <Text className="text-gold text-sm mt-3">{booking.specialRequests}</Text> : null}
    </Card>
    <RouteMapCard booking={booking} mapUri={mapUri} mapReason={mapReason} mapLoading={mapLoading} onRetry={onRetryMap} />
    <PassengerPreferencesCard preferences={booking.passengerPreferences} />
    <CharterDetailsCard booking={booking} />
    <TripExtrasCard extras={booking.extras} />
    {booking.driverReview ? <Card className="mb-4"><Text className="text-[11px] uppercase text-muted mb-2">Passenger Review</Text><View className="flex-row items-center gap-1">{[1, 2, 3, 4, 5].map((star) => <Text key={star} style={{ color: star <= booking.driverReview!.rating ? colors.gold : colors.muted }}>★</Text>)}<Text className="text-white text-sm ml-1">{booking.driverReview.rating}/5</Text></View>{booking.driverReview.comment ? <Text className="text-muted text-sm mt-2">{booking.driverReview.comment}</Text> : <Text className="text-muted text-sm mt-2">No written comment</Text>}</Card> : null}
    {showEarnings ? <Card className="mb-4"><Text className="text-[11px] uppercase text-muted mb-2">Your Earnings</Text><Text className="font-serif text-gold text-2xl">${booking.driverEarnings.toFixed(2)}</Text>{booking.driverFareEarnings != null ? <Text className="text-muted text-xs mt-2">Fare ${booking.driverFareEarnings.toFixed(2)}{(booking.driverExtrasEarnings ?? 0) > 0 ? ` · Extras $${booking.driverExtrasEarnings!.toFixed(2)}` : ""}{(booking.driverOvertimeEarnings ?? 0) > 0 ? ` · Overtime $${booking.driverOvertimeEarnings!.toFixed(2)}` : ""}</Text> : null}</Card> : null}
  </View>;
}
