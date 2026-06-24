import { Text, View } from "react-native";
import { Card } from "@/components/Card";

export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex-1 items-center">
      <Text className="font-serif text-lg text-gold">{value}</Text>
      <View className="h-1" />
      <Text className="text-[11px] uppercase tracking-wider text-muted">{label}</Text>
    </Card>
  );
}
