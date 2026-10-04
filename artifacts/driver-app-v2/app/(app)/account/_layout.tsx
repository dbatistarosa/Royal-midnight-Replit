import { Stack } from "expo-router";
import { colors } from "@/theme/colors";

export default function AccountLayout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.gold }}>
      <Stack.Screen name="index" options={{ title: "Profile", headerShown: false }} />
      <Stack.Screen name="payout" options={{ title: "Payout & Banking" }} />
      <Stack.Screen name="documents" options={{ title: "Documents" }} />
      <Stack.Screen name="support" options={{ headerShown: false }} />
    </Stack>
  );
}
