import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/auth/store";
import { useDriverByUserId } from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { colors } from "@/theme/colors";

const MENU_ITEMS: { label: string; icon: keyof typeof Ionicons.glyphMap; href: string; badge?: boolean }[] = [
  { label: "My Vehicle", icon: "car-sport", href: "/(app)/account/vehicle" },
  { label: "Documents", icon: "document-text", href: "/(app)/account/documents" },
  { label: "Payout & Banking", icon: "card", href: "/(app)/account/payout" },
  { label: "Support", icon: "help-circle", href: "/(app)/account/support" },
  { label: "Notifications", icon: "notifications", href: "/(app)/notifications" },
];

export default function AccountScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { data: driver } = useDriverByUserId(user?.id ?? null);

  const vehicleLabel = driver
    ? [driver.vehicleColor, driver.vehicleYear, driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(" ")
    : "";

  return (
    <ScreenContainer>
      <View className="items-center pt-6 pb-6">
        {driver?.profilePicture ? (
          <Image source={{ uri: driver.profilePicture }} style={{ width: 88, height: 88, borderRadius: 44 }} />
        ) : (
          <View className="h-22 w-22 rounded-full bg-surface items-center justify-center" style={{ width: 88, height: 88, borderRadius: 44 }}>
            <Ionicons name="person" size={36} color={colors.muted} />
          </View>
        )}
        <Text className="font-serif text-xl text-white mt-3">{driver?.name}</Text>
        {driver?.rating != null ? (
          <View className="flex-row items-center mt-1 gap-1">
            <Ionicons name="star" size={14} color={colors.gold} />
            <Text className="text-muted text-xs">{driver.rating.toFixed(2)} · {driver.totalRides} rides</Text>
          </View>
        ) : null}
      </View>

      <Card className="mb-5">
        <Text className="text-[11px] uppercase text-muted mb-1">Vehicle</Text>
        <Text className="text-white text-sm">{vehicleLabel || "—"}</Text>
        <Text className="text-muted text-xs mt-1">{driver?.serviceArea}</Text>
      </Card>

      <View className="gap-2 mb-6">
        {MENU_ITEMS.map((item) => (
          <Pressable key={item.label} onPress={() => router.push(item.href as never)}>
            <Card className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <Ionicons name={item.icon} size={18} color={colors.gold} />
                <Text className="text-white text-sm">{item.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Card>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={logout}>
        <Text className="text-danger text-center text-sm py-3">Log Out</Text>
      </Pressable>
    </ScreenContainer>
  );
}
