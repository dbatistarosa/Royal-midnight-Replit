import type { ExpoConfig } from "expo/config";

const publicApi = "https://www.royalmidnight.com/api";
// The file is intentionally opt-in. EAS does not upload ignored local files;
// production/preview builds must provide it through an EAS file variable.
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;

const config: ExpoConfig = {
  name: "Royal Midnight Driver",
  slug: "royal-midnight-driver",
  scheme: "royalmidnightdriver",
  version: "2.0.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: "com.royalmidnight.driver",
    buildNumber: "2",
    supportsTablet: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Royal Midnight needs your location to show nearby ride offers and share your position with dispatch.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Royal Midnight tracks your location during an active trip so dispatch and the passenger can see your live position, including while your screen is off.",
      UIBackgroundModes: ["location"],
    },
  },
  android: {
    package: "com.royalmidnight.driver",
    ...(googleServicesFile ? { googleServicesFile } : {}),
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0a0a0f",
    },
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "POST_NOTIFICATIONS",
    ],
  },
  updates: {
    url: "https://u.expo.dev/caed6e0b-2b17-47d6-aaeb-1675e9cda7d4",
  },
  runtimeVersion: { policy: "appVersion" },
  plugins: [
    "expo-router",
    [
      "expo-build-properties",
      { android: { buildArchs: ["arm64-v8a", "x86_64"] } },
    ],
    "expo-secure-store",
    "expo-notifications",
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "Allow Royal Midnight to track your location during active trips, including while your screen is off.",
      },
    ],
    [
      "expo-splash-screen",
      { image: "./assets/splash.png", backgroundColor: "#0a0a0f" },
    ],
  ],
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? publicApi,
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? "caed6e0b-2b17-47d6-aaeb-1675e9cda7d4",
    },
  },
};

export default config;
