import { Text, View } from "react-native";
import { Card } from "@/components/Card";
import type { DriverBookingExtra } from "@/api/types";

export function TripExtrasCard({ extras }: { extras?: DriverBookingExtra[] | null }) {
  if (!extras?.length) return null;
  return <Card className="mb-4"><Text className="text-[11px] uppercase text-muted mb-2">Extras</Text>{extras.map((extra) => <View key={extra.id} className="flex-row justify-between mb-1"><Text className="text-white text-sm flex-1">{extra.name} × {extra.quantity}</Text><Text className="text-gold text-sm">${(extra.driverAmount ?? (extra.paidToDriver ? extra.price * extra.quantity : 0)).toFixed(2)}</Text></View>)}</Card>;
}
