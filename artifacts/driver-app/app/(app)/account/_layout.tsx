import { Stack } from "expo-router";

export default function AccountLayout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: "#0a0a0f" }, headerStyle: { backgroundColor: "#1a1a2e" }, headerTintColor: "#c9a84c" }}>
      <Stack.Screen name="index" options={{ title: "Account" }} />
      <Stack.Screen name="payout" options={{ title: "Payout & Banking" }} />
      <Stack.Screen name="documents" options={{ title: "Documents" }} />
      <Stack.Screen name="support" options={{ headerShown: false }} />
    </Stack>
  );
}
