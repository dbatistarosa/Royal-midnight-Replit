import { useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { format, startOfWeek, startOfMonth, startOfDay } from "date-fns";
import { useAuthStore } from "@/auth/store";
import { useDriverEarnings } from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { ScreenTitle, Segments, EmptyState } from "@/components/DriverUI";
import { colors } from "@/theme/colors";
import { averagePerRide, buildCustomEarningsRange, earningsPeriodLabel, periodFareShare, statementHtml, type EarningsRangeKey } from "@/domain/earnings";

const RANGES = [
  { key: "today", label: "Today", start: () => startOfDay(new Date()) },
  { key: "week", label: "This Week", start: () => startOfWeek(new Date()) },
  { key: "month", label: "This Month", start: () => startOfMonth(new Date()) },
  { key: "all", label: "All Time", start: null },
  { key: "custom", label: "Custom", start: null },
] as const;
type RangeKey = EarningsRangeKey;

export default function EarningsScreen() {
  const driverId = useAuthStore((s) => s.driverId);
  const [rangeKey, setRangeKey] = useState<RangeKey>("week");
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(new Date(), "yyyy-MM-dd"));

  const range = useMemo(() => {
    const selected = RANGES.find((r) => r.key === rangeKey)!;
    if (selected.start == null) {
      if (rangeKey !== "custom") return undefined;
      return buildCustomEarningsRange(customStart, customEnd) ?? undefined;
    }
    return { startDate: selected.start().toISOString(), endDate: new Date().toISOString() };
  }, [rangeKey, customStart, customEnd]);

  const customRangeInvalid = rangeKey === "custom" && !range;
  const { data: earnings, isLoading, isError, refetch, isRefetching } = useDriverEarnings(customRangeInvalid ? null : driverId, range);

  const maxDaily = Math.max(1, ...(earnings?.recentPayouts?.map((p) => p.amount) ?? [1]));
  const periodFare = periodFareShare(earnings?.periodEarnings ?? 0, earnings?.periodTips ?? 0);
  const periodAverage = averagePerRide(earnings?.periodEarnings ?? 0, earnings?.periodRides ?? 0);

  async function exportStatement() {
    if (customRangeInvalid) {
      Alert.alert("Invalid date range", "Enter valid dates in YYYY-MM-DD format, with the start date on or before the end date.");
      return;
    }
    const label = earningsPeriodLabel(rangeKey, customStart, customEnd);
    try {
      const { uri } = await Print.printToFileAsync({
        html: statementHtml({
          periodLabel: label,
          periodEarnings: earnings?.periodEarnings ?? 0,
          periodTips: earnings?.periodTips ?? 0,
          periodRides: earnings?.periodRides ?? 0,
          commissionPct: earnings?.commissionPct ?? 0,
        }),
      });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", "This device cannot share the PDF earnings statement.");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Share earnings statement",
        UTI: "com.adobe.pdf",
      });
    } catch {
      Alert.alert("Export unavailable", "Your PDF earnings statement could not be generated or shared from this device.");
    }
  }

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.gold} />}>
      <ScreenTitle title="Earnings" />

      <Segments options={RANGES} value={rangeKey} onChange={setRangeKey} />
      {rangeKey === "custom" ? <Card className="mb-4"><Text className="text-[11px] uppercase text-muted mb-2">Custom date range</Text><View className="flex-row gap-3"><View className="flex-1"><Text className="text-muted text-xs mb-1">From</Text><TextInput value={customStart} onChangeText={setCustomStart} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} className="rounded-md border border-border bg-surface px-3 py-2 text-white" autoCapitalize="none" /></View><View className="flex-1"><Text className="text-muted text-xs mb-1">To</Text><TextInput value={customEnd} onChangeText={setCustomEnd} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} className="rounded-md border border-border bg-surface px-3 py-2 text-white" autoCapitalize="none" /></View></View>{customRangeInvalid ? <Text className="text-danger text-xs mt-3">Enter real calendar dates in YYYY-MM-DD format, with From on or before To.</Text> : null}</Card> : null}
      {customRangeInvalid ? <EmptyState title="Invalid date range" message="Correct the dates above to load earnings. No request was sent." /> : isError ? <EmptyState title="Couldn't load earnings" message="Check your connection and try again." onRetry={() => void refetch()} /> : isLoading ? <EmptyState loading title="Loading earnings" message="Retrieving your earnings for this period." /> : <>

      <Card className="mb-3 py-6">
        <Text className="text-white text-sm mb-2">Total Earnings</Text>
        <Text className="font-sans-medium text-4xl text-gold">${(earnings?.periodEarnings ?? 0).toFixed(2)}</Text>
      </Card>

      <View className="flex-row gap-3 mb-6">
        <StatTile label="Fare Share" value={`$${periodFare.toFixed(2)}`} />
        <StatTile label="Tips" value={`$${(earnings?.periodTips ?? 0).toFixed(2)}`} />
        <StatTile label="Rides" value={String(earnings?.periodRides ?? 0)} />
      </View>

      <Card className="mb-5"><View className="flex-row justify-between"><Text className="text-muted text-xs">Commission rate</Text><Text className="text-white text-sm">{((earnings?.commissionPct ?? 0) * 100).toFixed(0)}% of fares</Text></View><View className="flex-row justify-between mt-2"><Text className="text-muted text-xs">Average per ride</Text><Text className="text-white text-sm">${periodAverage.toFixed(2)}</Text></View><View className="flex-row justify-between mt-2"><Text className="text-muted text-xs">All-time rides</Text><Text className="text-white text-sm">{earnings?.totalRides ?? 0}</Text></View></Card>

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
      ) : <EmptyState icon="bar-chart-outline" title="No earnings in this period" message="Completed rides and tips will appear in your earnings breakdown." />}
      <Pressable accessibilityRole="button" onPress={() => void exportStatement()} className="mt-5"><Card className="flex-row items-center gap-3"><Ionicons name="document-text-outline" size={22} color={colors.gold} /><View className="flex-1"><Text className="text-white text-sm font-sans-medium">Export PDF statement</Text><Text className="text-muted text-xs mt-1">Generate and share the selected period</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Card></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/payout")} className="mt-5"><Card className="flex-row items-center gap-3"><Ionicons name="wallet-outline" size={25} color={colors.gold} /><View className="flex-1"><Text className="text-white text-sm font-sans-medium">Payout & Banking</Text><Text className="text-muted text-xs mt-1">Manage your payout details</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Card></Pressable>
      </>}
    </ScreenContainer>
  );
}
