import { useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { router } from "expo-router";
import { formatDistanceToNow } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/auth/store";
import { useNotifications, useMarkNotificationRead } from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenTitle, Segments, EmptyState } from "@/components/DriverUI";
import { notificationCategory } from "@/theme/driverPresentation";
import { colors } from "@/theme/colors";
import { buildTripHref } from "@/navigation/returnTarget";

const TABS = [{ key: "all", label: "All" }, { key: "bookings", label: "Bookings" }, { key: "system", label: "System" }, { key: "documents", label: "Documents" }] as const;
export default function NotificationsScreen() {
  const userId = useAuthStore(s => s.user?.id ?? null);
  const { data, isLoading, isError, refetch, isRefetching } = useNotifications(userId);
  const markRead = useMarkNotificationRead();
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("all");
  const notices = (data ?? []).filter(n => tab === "all" || notificationCategory(n) === tab);
  return <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.gold} />}>
    <ScreenTitle title="Notifications" /><Segments options={TABS} value={tab} onChange={setTab} />
    {markRead.isError ? <Text accessibilityRole="alert" className="text-danger text-sm mb-3">Couldn't mark this notification as read. Try again.</Text> : null}
    {isError ? <EmptyState title="Couldn't load notifications" message="Check your connection and try again." onRetry={() => void refetch()} /> : isLoading ? <EmptyState loading title="Loading notifications" message="Checking your latest updates." /> : notices.length === 0 ? <EmptyState icon="notifications-outline" title="You're all caught up" message="Booking updates, document notices and announcements will appear here." /> : notices.map(n => {
      const category = notificationCategory(n);
      return <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={(n.isRead ? "" : "Unread: ") + n.title} onPress={() => { if (!n.isRead) markRead.mutate(n.id); if (n.bookingId) router.push(buildTripHref(n.bookingId, "alerts") as never); else if (category === "documents") router.push("/(app)/account/documents"); }} className="flex-row gap-3 border-b border-border py-5">
        <View className="h-12 w-12 rounded-xl border border-border bg-surface items-center justify-center"><Ionicons name={category === "documents" ? "document-text-outline" : category === "bookings" ? "airplane-outline" : "information-circle-outline"} size={25} color={colors.gold} />{!n.isRead ? <View className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-gold" /> : null}</View>
        <View className="flex-1"><Text className="text-white font-sans-medium text-sm mb-1">{n.title}</Text><Text className="text-muted text-xs leading-5">{n.message}</Text><Text className="text-muted text-[10px] mt-2">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</Text></View>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </Pressable>;
    })}
  </ScreenContainer>;
}
