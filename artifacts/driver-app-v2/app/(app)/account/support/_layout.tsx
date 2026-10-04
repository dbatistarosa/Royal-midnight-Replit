import { Stack } from "expo-router";

export default function SupportLayout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: "#0a0a0f" }, headerStyle: { backgroundColor: "#1a1a2e" }, headerTintColor: "#c9a84c" }}>
      <Stack.Screen name="index" options={{ title: "Support" }} />
      <Stack.Screen name="new" options={{ title: "New Ticket" }} />
      <Stack.Screen name="[ticketId]" options={{ title: "Ticket" }} />
    </Stack>
  );
}
