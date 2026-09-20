import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { patchDriverPushToken } from "@/api/driverApi";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Register the device with Expo and persist the current token on the driver. */
export async function registerForPushNotifications(driverId: number): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#D4AF37",
    });
  }

  const permissions = await Notifications.getPermissionsAsync();
  let status = permissions.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error("EAS projectId is missing; push registration is unavailable");
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await patchDriverPushToken(driverId, token, Platform.OS);
}
