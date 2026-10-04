import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors } from "@/theme/colors";

export function ScreenTitle({ title, back = false, backHref }: { title: string; back?: boolean; backHref?: string }) {
  return <View style={s.header}>
    {back ? <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => backHref ? router.replace(backHref as never) : router.back()} style={s.back}><Ionicons name="chevron-back" size={22} color={colors.white} /></Pressable> : null}
    <Text accessibilityRole="header" style={s.title}>{title}</Text>
  </View>;
}

export function Segments<T extends string>({ options, value, onChange }: { options: readonly { key: T; label: string }[]; value: T; onChange: (key: T) => void }) {
  return <View style={s.segments}>{options.map(option => <Pressable key={option.key} accessibilityRole="tab" accessibilityState={{ selected: value === option.key }} onPress={() => onChange(option.key)} style={[s.segment, value === option.key && s.selected]}>
    <Text numberOfLines={1} adjustsFontSizeToFit style={[s.segmentText, value === option.key && s.selectedText]}>{option.label}</Text>
  </Pressable>)}</View>;
}

export function EmptyState({ icon = "car-outline", title, message, loading = false, onRetry }: { icon?: keyof typeof Ionicons.glyphMap; title: string; message: string; loading?: boolean; onRetry?: () => void }) {
  return <View style={s.empty}>
    <View style={s.emptyIcon}>{loading ? <ActivityIndicator color={colors.gold} /> : <Ionicons name={icon} size={28} color={colors.gold} />}</View>
    <Text style={s.emptyTitle}>{title}</Text><Text style={s.emptyMessage}>{message}</Text>
    {onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} style={s.retry}><Text style={s.retryText}>Try again</Text></Pressable> : null}
  </View>;
}

export function RouteStops({ pickup, dropoff, stops = [] }: { pickup: string; dropoff: string; stops?: string[] }) {
  const addresses = [pickup, ...stops.filter(Boolean), dropoff];
  return <View style={{ gap: 14, marginVertical: 12 }}>
    <View style={s.routeLine} />
    {addresses.map((address, index) => <View key={`${address}-${index}`} style={s.stop}>
      <View style={[s.dot, { borderColor: index === 0 ? colors.success : index === addresses.length - 1 ? colors.gold : colors.muted }]} />
      <Text style={s.address}>{address}</Text>
    </View>)}
  </View>;
}

const s = StyleSheet.create({
  header: { minHeight: 64, justifyContent: "center", alignItems: "center", marginBottom: 8 },
  title: { color: colors.white, fontFamily: "Inter_600SemiBold", fontSize: 20 },
  back: { position: "absolute", left: 0, padding: 10 },
  segments: { flexDirection: "row", gap: 5, marginBottom: 20, backgroundColor: colors.input, padding: 4, borderRadius: 13 },
  segment: { flex: 1, paddingVertical: 11, alignItems: "center", borderRadius: 10 },
  selected: { backgroundColor: colors.gold, borderWidth: 1, borderColor: colors.goldBright },
  segmentText: { color: colors.muted, fontFamily: "Inter_600SemiBold", fontSize: 11 },
  selectedText: { color: colors.background },
  empty: { paddingVertical: 34, paddingHorizontal: 22, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, alignItems: "center", gap: 12 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.white, fontFamily: "Inter_600SemiBold", fontSize: 16, textAlign: "center" },
  emptyMessage: { color: colors.muted, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 21, textAlign: "center" },
  retry: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 9, borderWidth: 1, borderColor: colors.gold },
  retryText: { color: colors.gold, fontFamily: "Inter_600SemiBold" },
  stop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 4, backgroundColor: colors.card },
  routeLine: { position: "absolute", width: 1, backgroundColor: colors.gold, top: 10, bottom: 10, left: 5.5 },
  address: { flex: 1, color: colors.white, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20 },
});
