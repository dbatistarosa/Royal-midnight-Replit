import "../global.css";
import { queryClient } from "@/api/queryClient";
import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Text, View, Pressable } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display";
import { Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "@/auth/store";
import { configureApiClient } from "@/api/client";

SplashScreen.preventAutoHideAsync().catch(() => {});

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#0a0a0f", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Text style={{ color: "#D4AF37", fontSize: 20, marginBottom: 12 }}>Royal Midnight</Text>
      <Text style={{ color: "#ffffff", textAlign: "center", marginBottom: 20 }}>
        No se pudo cargar esta pantalla. Intenta nuevamente.
      </Text>
      <Pressable onPress={retry} style={{ backgroundColor: "#D4AF37", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 6 }}>
        <Text style={{ color: "#0a0a0f" }}>Reintentar</Text>
      </Pressable>
      {__DEV__ ? <Text style={{ color: "#888888", fontSize: 11, textAlign: "center", marginTop: 18 }}>{error.message}</Text> : null}
    </View>
  );
}


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
