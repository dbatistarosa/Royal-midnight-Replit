import "../global.css";
import "@/location/locationTask";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display";
import { Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "@/auth/store";
import { configureApiClient } from "@/api/client";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const [fontsLoaded] = useFonts({ PlayfairDisplay_700Bold, Inter_400Regular, Inter_600SemiBold });
  const [clientConfigured, setClientConfigured] = useState(false);

  useEffect(() => {
    configureApiClient();
    setClientConfigured(true);
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (isHydrated && fontsLoaded && clientConfigured) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isHydrated, fontsLoaded, clientConfigured]);

  if (!isHydrated || !fontsLoaded || !clientConfigured) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0a0a0f" } }} />
    </QueryClientProvider>
  );
}
