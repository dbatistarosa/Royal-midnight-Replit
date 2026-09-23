import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuthStore } from "@/auth/store";
import { login } from "@/api/driverApi";
import { colors } from "@/theme/colors";

export default function LoginScreen() {
  const storeLogin = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError("Ingresa tu correo y contraseña.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await login({ email: email.trim().toLowerCase(), password });
      if (res.user.role !== "driver") {
        setError("Esta app es solo para conductores.");
        return;
      }
      await storeLogin(res.user, res.token, res.driverId ?? null);
      router.replace("/(app)");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error al iniciar sesión. Verifica tus credenciales.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View className="flex-1 justify-center px-6">
          {/* Logo / título */}
          <View className="mb-10 items-center">
            <Text
              className="text-gold text-3xl"
              style={{ fontFamily: "PlayfairDisplay_700Bold" }}
            >
              Royal Midnight
            </Text>
            <Text className="text-muted text-sm mt-1" style={{ fontFamily: "Inter_400Regular" }}>
              Portal de Conductores
            </Text>
          </View>

          {/* Email */}
          <Text
            className="text-white text-xs uppercase tracking-widest mb-1"
            style={{ fontFamily: "Inter_600SemiBold" }}
          >
            Correo Electrónico
          </Text>
          <TextInput
            className="bg-surface text-white rounded-md px-4 py-3 mb-4 border border-border text-base"
            style={{ fontFamily: "Inter_400Regular" }}
            placeholder="driver@royalmidnight.com"
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            editable={!loading}
          />

          {/* Password */}
          <Text
            className="text-white text-xs uppercase tracking-widest mb-1"
            style={{ fontFamily: "Inter_600SemiBold" }}
          >
            Contraseña
          </Text>
          <TextInput
            className="bg-surface text-white rounded-md px-4 py-3 mb-6 border border-border text-base"
            style={{ fontFamily: "Inter_400Regular" }}
            placeholder="••••••••"
            placeholderTextColor={colors.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            editable={!loading}
            onSubmitEditing={handleLogin}
            returnKeyType="done"
          />

          {/* Error */}
          {error ? (
            <Text
              className="text-danger text-sm mb-4 text-center"
              style={{ fontFamily: "Inter_400Regular" }}
            >
              {error}
            </Text>
          ) : null}

          {/* Botón */}
          <Pressable
            onPress={handleLogin}
            disabled={loading}
            className={`w-full items-center justify-center rounded-md py-4 bg-gold ${loading ? "opacity-50" : ""}`}
          >
            {loading ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text
                className="text-background text-sm uppercase tracking-wide"
                style={{ fontFamily: "Inter_600SemiBold" }}
              >
                Iniciar Sesión
              </Text>
            )}
          </Pressable>

          <Text
            className="text-muted text-xs text-center mt-8"
            style={{ fontFamily: "Inter_400Regular" }}
          >
            ¿Problemas para entrar? Contacta a tu despachador.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
