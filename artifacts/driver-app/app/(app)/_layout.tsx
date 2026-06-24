import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, Tabs, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/auth/store";
import { useDriverByUserId } from "@/api/hooks";
import { useNotificationHandlers } from "@/notifications/useNotificationHandlers";
import { registerForPushNotifications } from "@/notifications/registerForPushNotifications";
import { colors } from "@/theme/colors";

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const driverId = useAuthStore((s) => s.driverId);
  const segments = useSegments();
  const { data: driver, isLoading } = useDriverByUserId(user?.id ?? null);

  useNotificationHandlers();

  useEffect(() => {
    if (driverId) registerForPushNotifications(driverId).catch((err) => console.error("[push] register failed:", err));
  }, [driverId]);

  // Allow the documents screen even while on compliance hold — it's the
  // escape hatch that lets a driver actually clear the hold.
  const isDocumentsRoute = segments.includes("documents");

  if (isLoading || !driver) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  if (driver.approvalStatus === "pending") return <Redirect href="/(gates)/pending" />;
  if (driver.approvalStatus === "rejected") return <Redirect href="/(gates)/rejected" />;
  if (driver.complianceHold && !isDocumentsRoute) return <Redirect href="/(gates)/compliance-hold" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="trips" options={{ title: "Trips", tabBarIcon: ({ color, size }) => <Ionicons name="time" size={size} color={color} /> }} />
      <Tabs.Screen name="earnings" options={{ title: "Earnings", tabBarIcon: ({ color, size }) => <Ionicons name="cash" size={size} color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }} />
      <Tabs.Screen name="offer/[bookingId]" options={{ href: null }} />
      <Tabs.Screen name="trip/[bookingId]" options={{ href: null }} />
      <Tabs.Screen name="notifications/index" options={{ href: null }} />
    </Tabs>
  );
}
