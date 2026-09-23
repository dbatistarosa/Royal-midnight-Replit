import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { format } from "date-fns";
import { useAuthStore } from "@/auth/store";
import { useNotifications, useMarkNotificationRead } from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";

export default function NotificationsScreen() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { data: notifications } = useNotifications(userId);
  const markRead = useMarkNotificationRead();

  function handlePress(notificationId: number, bookingId: number | null, isRead: boolean) {
    if (!isRead) markRead.mutate(notificationId);
    if (bookingId) router.push(`/trip/${bookingId}`);
  }

  return (
    <ScreenContainer>
      <Text className="font-serif text-xl text-white pt-4 pb-4">Notifications</Text>

      {!notifications || notifications.length === 0 ? (
        <Text className="text-muted text-sm">No notifications yet.</Text>
      ) : (
        <View className="gap-3">
          {notifications.map((n) => (
            <Pressable key={n.id} onPress={() => handlePress(n.id, n.bookingId, n.isRead)}>
              <Card className={n.isRead ? "" : "border-gold"}>
                <Text className="text-white text-sm font-sans-medium mb-1">{n.title}</Text>
                <Text className="text-muted text-xs mb-2">{n.message}</Text>
                <Text className="text-muted text-[10px]">{format(new Date(n.createdAt), "MMM d, h:mm a")}</Text>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
