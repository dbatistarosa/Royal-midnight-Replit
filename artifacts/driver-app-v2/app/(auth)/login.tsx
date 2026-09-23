import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/auth/store";
import { login } from "@/api/driverApi";
import { normalizeLoginCredentials, validateLoginCredentials } from "@/auth/loginValidation";
import { colors } from "@/theme/colors";

export default function LoginScreen() {
  const storeLogin = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);
  const passwordInputRef = useRef<TextInput>(null);

  async function handleLogin() {
    const validation = validateLoginCredentials({ email, password });
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    const credentials = normalizeLoginCredentials({ email, password });
    setError(null);
    setLoading(true);
    try {
      const res = await login(credentials);
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

  function openDriverApplication() {
    void Linking.openURL("https://www.royalmidnight.com/driver/onboarding");
  }

  function openSupport() {
    void Linking.openURL("https://www.royalmidnight.com/contact");
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <View pointerEvents="none" style={styles.backgroundGlowTop} />
      <View pointerEvents="none" style={styles.backgroundGlowBottom} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandBlock}>
            <View style={styles.logoFrame}>
              <Image
                source={require("../../assets/icon.png")}
                style={styles.logo}
                resizeMode="contain"
                accessibilityRole="image"
                accessibilityLabel="Logo de Royal Midnight"
              />
            </View>
            <Text style={styles.brandName}>Royal Midnight</Text>
            <Text style={styles.brandTagline}>PORTAL DE CONDUCTORES</Text>
            <View style={styles.goldRule} />
          </View>

          <View style={styles.card}>
            <Text style={styles.heading}>Bienvenido de nuevo</Text>
            <Text style={styles.subheading}>Inicia sesión para administrar tus viajes</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Correo electrónico</Text>
              <View style={[styles.inputShell, focusedField === "email" && styles.inputShellFocused]}>
                <Ionicons name="mail-outline" size={19} color={colors.gold} style={styles.inputIcon} />
                <TextInput
                  testID="login-email"
                  style={styles.input}
                  placeholder="driver@royalmidnight.com"
                  placeholderTextColor={colors.placeholder}
                  value={email}
                  onChangeText={(value) => { setEmail(value); setError(null); }}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!loading}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                  accessibilityLabel="Correo electrónico"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Contraseña</Text>
              <View style={[styles.inputShell, focusedField === "password" && styles.inputShellFocused]}>
                <Ionicons name="lock-closed-outline" size={19} color={colors.gold} style={styles.inputIcon} />
                <TextInput
                  testID="login-password"
                  ref={passwordInputRef}
                  style={styles.input}
                  placeholder="Ingresa tu contraseña"
                  placeholderTextColor={colors.placeholder}
                  value={password}
                  onChangeText={(value) => { setPassword(value); setError(null); }}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry={!showPassword}
                  autoComplete="current-password"
                  editable={!loading}
                  onSubmitEditing={handleLogin}
                  returnKeyType="go"
                  accessibilityLabel="Contraseña"
                />
                <Pressable
                  testID="toggle-password"
                  onPress={() => setShowPassword((visible) => !visible)}
                  style={styles.visibilityButton}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  hitSlop={8}
                >
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
                </Pressable>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox} accessibilityRole="alert">
                <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              testID="login-submit"
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => [styles.loginButton, pressed && styles.loginButtonPressed, loading && styles.loginButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión"
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Text style={styles.loginButtonText}>Iniciar sesión</Text>
                  <Ionicons name="arrow-forward" size={19} color={colors.background} />
                </>
              )}
            </Pressable>

            <Pressable
              testID="driver-application"
              onPress={openDriverApplication}
              style={styles.secondaryAction}
              accessibilityRole="link"
              accessibilityLabel="Solicitar acceso como conductor"
            >
              <Text style={styles.secondaryActionText}>¿Aún no tienes cuenta?</Text>
              <Text style={styles.secondaryActionLink}> Solicitar acceso como conductor</Text>
            </Pressable>

            <Pressable onPress={openSupport} style={styles.supportAction} accessibilityRole="link">
              <Ionicons name="help-circle-outline" size={16} color={colors.muted} />
              <Text style={styles.supportText}>¿Problemas para entrar? Contactar soporte</Text>
            </Pressable>
          </View>

          <Text style={styles.footer}>SERVICIO PRIVADO · ROYAL MIDNIGHT</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: { flex: 1 },
  backgroundGlowTop: {
    position: "absolute",
    top: -180,
    right: -130,
    width: 360,
    height: 360,
    borderRadius: 180,
    borderWidth: 1,
    borderColor: "rgba(201, 168, 76, 0.13)",
  },
  backgroundGlowBottom: {
    position: "absolute",
    bottom: -220,
    left: -180,
    width: 420,
    height: 420,
    borderRadius: 210,
    borderWidth: 1,
    borderColor: "rgba(62, 106, 161, 0.16)",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  brandBlock: {
    alignItems: "center",
    marginBottom: 24,
  },
  logoFrame: {
    width: 106,
    height: 106,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 53,
    borderWidth: 1,
    borderColor: "rgba(201, 168, 76, 0.55)",
    backgroundColor: "#0d1829",
    marginBottom: 13,
    shadowColor: colors.gold,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  logo: {
    width: 94,
    height: 94,
    borderRadius: 47,
  },
  brandName: {
    color: colors.goldBright,
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 29,
    letterSpacing: 1.2,
  },
  brandTagline: {
    color: colors.muted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 3,
    marginTop: 5,
  },
  goldRule: {
    width: 64,
    height: 1,
    backgroundColor: colors.gold,
    marginTop: 15,
    opacity: 0.8,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    shadowColor: "#000000",
    shadowOpacity: 0.38,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  heading: {
    color: colors.white,
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 24,
    textAlign: "center",
  },
  subheading: {
    color: colors.muted,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
    marginTop: 7,
    marginBottom: 24,
  },
  fieldGroup: { marginBottom: 16 },
  label: {
    color: colors.label,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  inputShell: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.input,
  },
  inputShellFocused: {
    borderColor: colors.gold,
    backgroundColor: "#13243a",
  },
  inputIcon: {
    marginLeft: 15,
    marginRight: 10,
  },
  input: {
    flex: 1,
    minHeight: 52,
    color: colors.white,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    paddingVertical: 0,
    paddingRight: 12,
  },
  visibilityButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.36)",
    backgroundColor: "rgba(127, 29, 29, 0.24)",
    marginBottom: 15,
  },
  errorText: {
    flex: 1,
    color: "#fca5a5",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  loginButton: {
    minHeight: 55,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.gold,
    shadowColor: colors.gold,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  loginButtonPressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
  loginButtonDisabled: { opacity: 0.6 },
  loginButtonText: {
    color: colors.background,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  secondaryAction: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 21,
    paddingVertical: 6,
  },
  secondaryActionText: {
    color: colors.muted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  secondaryActionLink: {
    color: colors.goldBright,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  supportAction: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    paddingVertical: 5,
  },
  supportText: {
    color: colors.muted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  footer: {
    color: "#506078",
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 1.6,
    textAlign: "center",
    marginTop: 22,
  },
});
