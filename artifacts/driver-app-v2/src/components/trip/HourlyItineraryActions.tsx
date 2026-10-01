import { Text, View } from "react-native";
import { GoldButton } from "@/components/GoldButton";
import type { DriverItineraryStop } from "@/api/types";
import { nextItineraryAction } from "@/domain/driverWorkflow";

export function HourlyItineraryActions({ stops, loading, onAction }: { stops: DriverItineraryStop[]; loading?: boolean; onAction: (sequence: number, action: "arrive" | "depart") => void }) {
  if (!stops.length) return null;
  const next = nextItineraryAction(stops);
  return <View className="mb-4"><Text className="text-gold text-xs uppercase tracking-wide mb-2">Hourly Stops</Text>{stops.map((stop) => <View key={stop.id} className="mb-2"><Text className="text-white text-sm">{stop.sequence}. {stop.kind === "final" ? "Final destination" : "Stop"}</Text><Text className="text-muted text-xs mt-1">{stop.address}</Text></View>)}{next ? <GoldButton label={next.action === "arrive" ? "Mark Arrival" : "Passenger Onboard & Depart"} onPress={() => onAction(next.sequence, next.action)} loading={loading} /> : <Text className="text-success text-sm text-center">All hourly stops completed.</Text>}</View>;
}
