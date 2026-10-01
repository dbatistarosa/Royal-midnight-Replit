import { useEffect } from "react";
import { ActivityIndicator, AppState, Text, View } from "react-native";
import { Redirect, Tabs, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ApiError } from "@/api/client";
import { useAuthStore } from "@/auth/store";
import { useDriverByUserId } from "@/api/hooks";
import { GoldButton } from "@/components/GoldButton";
import { colors } from "@/theme/colors";
import { registerForPushNotifications } from "@/notifications/registerForPushNotifications";
import { useNotificationHandlers } from "@/notifications/useNotificationHandlers";

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const segments = useSegments();
  const { data: driver, isLoading, isError, error, refetch } = useDriverByUserId(user?.id ?? null);
  useNotificationHandlers();

  useEffect(() => {
    if (!driver?.id) return;
    const register = () => {
      void registerForPushNotifications(driver.id).catch((registrationError) => {
        console.warn("[notifications] push registration unavailable:", registrationError?.message ?? registrationError);
      });
    };
    register();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") register();
    });
    return () => subscription.remove();
  }, [driver?.id]);

  // A failed fetch (most commonly a 401 on an expired/revoked session) used
  // to leave this screen spinning forever: isLoading settles to false but
  // driver stays undefined, so `isLoading || !driver` never clears, nothing
  // ever cleared the stale token, and there was no way back to login short
  // of reinstalling the app. Mirrors the web app's own 401 handling
  // (AuthProvider's fetch interceptor).
  const isAuthError = isError && error instanceof ApiError && (error.status === 401 || error.status === 403);

  useEffect(() => {
    if (isAuthError) void logout();
  }, [isAuthError, logout]);

  // Allow the documents screen even while on compliance hold — it's the
  // escape hatch that lets a driver actually clear the hold.
  const isDocumentsRoute = segments.includes("documents");

  if (!token || !user) return <Redirect href="/(auth)/login" />;
  if (isAuthError) return <Redirect href="/(auth)/login" />;

  // A non-auth failure (dropped connection, 500, timeout) is not a reason to
  // wipe a perfectly valid session — offer a retry instead of forcing a
  // fresh login.
  if (isError) {
    return (
      <View className="flex-1 items-center justify-center bg-background gap-4 px-8">
        <Text className="text-muted text-center">Couldn't load your account. Check your connection and try again.</Text>
        <GoldButton label="Retry" onPress={() => void refetch()} variant="outline" />
      </View>
    );
  }

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
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="trips" options={{ title: "Rides", tabBarIcon: ({ color, size }) => <Ionicons name="car-sport" size={size} color={color} /> }} />
      <Tabs.Screen name="earnings" options={{ title: "Earnings", tabBarIcon: ({ color, size }) => <Ionicons name="cash" size={size} color={color} /> }} />
      <Tabs.Screen name="notifications/index" options={{ title: "Alerts", tabBarIcon: ({ color, size }) => <Ionicons name="notifications" size={size} color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }} />
      <Tabs.Screen name="offer/[bookingId]" options={{ href: null }} />
      <Tabs.Screen name="trip/[bookingId]" options={{ href: null }} />
    </Tabs>
  );
}
