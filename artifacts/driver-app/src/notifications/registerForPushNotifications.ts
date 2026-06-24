import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { patchDriverPushToken } from "@/api/driverApi";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("ride-offers", {
    name: "Ride offers",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
  });
}

export async function registerForPushNotifications(driverId: number): Promise<void> {
  if (!Device.isDevice) return; // push tokens aren't available on simulators/emulators

  await ensureNotificationChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== "granted") {
    const { status: requested } = await Notifications.requestPermissionsAsync();
    status = requested;
  }
  if (status !== "granted") return;

  const projectId = Constants.expoConfig?.extra?.["eas"]?.["projectId"] as string | undefined;
  const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);

  const platform = Platform.OS === "ios" ? "ios" : "android";
  await patchDriverPushToken(driverId, tokenResponse.data, platform);
}
