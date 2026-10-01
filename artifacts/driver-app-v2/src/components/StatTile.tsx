import { Text, View } from "react-native";
import { Card } from "@/components/Card";

export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex-1 items-center px-2 py-3">
      <Text numberOfLines={1} adjustsFontSizeToFit className="font-sans-medium text-lg text-white">{value}</Text>
      <View className="h-1" />
      <Text className="text-[11px] text-muted">{label}</Text>
    </Card>
  );
}
