import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

export function useNotificationHandlers(): void {
  useEffect(() => {
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      const bookingId = typeof data?.bookingId === "number" || typeof data?.bookingId === "string"
        ? String(data.bookingId)
        : null;
      if (!bookingId) return;
      const type = String(data?.type ?? "");
      if (type === "new_ride_offer") {
        router.push({ pathname: "/(app)/offer/[bookingId]", params: { bookingId } } as never);
      } else if (type === "trip_assigned") {
        router.push({ pathname: "/(app)/trip/[bookingId]", params: { bookingId } } as never);
      }
    });
    return () => responseSubscription.remove();
  }, []);
}
