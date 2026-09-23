import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { format, startOfWeek, startOfMonth, startOfDay } from "date-fns";
import { useAuthStore } from "@/auth/store";
import { useDriverEarnings } from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";

const RANGES = [
  { key: "today", label: "Today", start: () => startOfDay(new Date()) },
  { key: "week", label: "This Week", start: () => startOfWeek(new Date()) },
  { key: "month", label: "This Month", start: () => startOfMonth(new Date()) },
] as const;

export default function EarningsScreen() {
  const driverId = useAuthStore((s) => s.driverId);
  const [rangeKey, setRangeKey] = useState<typeof RANGES[number]["key"]>("week");

  const range = useMemo(() => {
    const selected = RANGES.find((r) => r.key === rangeKey)!;
    return { startDate: selected.start().toISOString(), endDate: new Date().toISOString() };
  }, [rangeKey]);

  const { data: earnings } = useDriverEarnings(driverId, range);

  const maxDaily = Math.max(1, ...(earnings?.recentPayouts?.map((p) => p.amount) ?? [1]));

  return (
    <ScreenContainer>
      <Text className="font-serif text-xl text-white pt-4 pb-4">Earnings</Text>

      <View className="flex-row gap-2 mb-5">
        {RANGES.map((r) => (
          <Pressable
            key={r.key}
            onPress={() => setRangeKey(r.key)}
            className={`px-3 py-1.5 rounded-full border ${rangeKey === r.key ? "bg-gold border-gold" : "border-border"}`}
          >
            <Text className={`text-xs ${rangeKey === r.key ? "text-background font-sans-medium" : "text-muted"}`}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      <Card className="items-center mb-5">
        <Text className="text-muted text-xs uppercase tracking-wide mb-1">Total Earnings</Text>
        <Text className="font-serif text-3xl text-gold">${(earnings?.periodEarnings ?? 0).toFixed(2)}</Text>
      </Card>

      <View className="flex-row gap-3 mb-6">
        <StatTile label="Fares" value={`$${((earnings?.periodEarnings ?? 0) - (earnings?.periodTips ?? 0)).toFixed(2)}`} />
        <StatTile label="Tips" value={`$${(earnings?.periodTips ?? 0).toFixed(2)}`} />
        <StatTile label="Rides" value={String(earnings?.periodRides ?? 0)} />
      </View>

      {earnings?.recentPayouts && earnings.recentPayouts.length > 0 ? (
        <Card>
          <Text className="text-[11px] uppercase text-muted mb-3">Daily Breakdown</Text>
          <View className="flex-row items-end gap-2" style={{ height: 100 }}>
            {earnings.recentPayouts.map((day) => (
              <View key={day.date} className="flex-1 items-center">
                <View
                  className="w-full rounded-t bg-gold"
                  style={{ height: Math.max(4, (day.amount / maxDaily) * 80) }}
                />
                <Text className="text-[9px] text-muted mt-1">{format(new Date(day.date), "EEE")}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </ScreenContainer>
  );
}
