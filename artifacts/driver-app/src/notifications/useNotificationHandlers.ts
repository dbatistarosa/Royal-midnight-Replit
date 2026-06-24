import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";

export function useNotificationHandlers() {
  const router = useRouter();

  useEffect(() => {
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const bookingId = response.notification.request.content.data?.["bookingId"];
      const type = response.notification.request.content.data?.["type"];
      if (type === "new_ride_offer" && bookingId) {
        router.push(`/offer/${bookingId}`);
      }
    });

    return () => {
      responseSub.remove();
    };
  }, [router]);
}
