import { useEffect } from "react";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";

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
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { bookingId?: number | string } | undefined;
      if (data?.bookingId != null) router.push(`/trip/${data.bookingId}`);
      else router.push("/(app)/notifications");
    });
    return () => responseSubscription.remove();
  }, []);
}
