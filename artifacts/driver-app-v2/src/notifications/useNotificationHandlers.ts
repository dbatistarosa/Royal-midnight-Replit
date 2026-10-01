import { useEffect } from "react";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { notificationRoute } from "@/notifications/notificationRoute";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function useNotificationHandlers(): void {
  useEffect(() => {
    const openResponse = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as
        | { type?: unknown; bookingId?: unknown }
        | undefined;
      router.push(notificationRoute(data) as never);
    };

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      openResponse(response);
    });

    // The listener only covers taps received after this layout mounts. If the
    // app was closed, Expo retains the tap that launched it and it must be
    // consumed explicitly or the notification appears to do nothing.
    let cancelled = false;
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!cancelled && response) {
        openResponse(response);
        void Notifications.clearLastNotificationResponseAsync();
      }
    });

    return () => {
      cancelled = true;
      responseSubscription.remove();
    };
  }, []);
}
