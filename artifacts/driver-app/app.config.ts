import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Royal Midnight Driver",
  slug: "royal-midnight-driver",
  scheme: "royalmidnightdriver",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: "com.royalmidnight.driver",
    buildNumber: "1",
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
    versionCode: 1,
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
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "Allow Royal Midnight to track your location during active trips, including while your screen is off.",
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#c9a84c",
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash.png",
        backgroundColor: "#0a0a0f",
      },
    ],
  ],
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://royalmidnight.com/api",
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? "caed6e0b-2b17-47d6-aaeb-1675e9cda7d4",
    },
  },
};

export default config;
