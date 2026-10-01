type NotificationData = {
  type?: unknown;
  bookingId?: unknown;
};

export function notificationRoute(data: NotificationData | null | undefined): string {
  const bookingId = typeof data?.bookingId === "number"
    ? data.bookingId
    : typeof data?.bookingId === "string" && /^\d+$/.test(data.bookingId)
      ? Number(data.bookingId)
      : null;

  if (bookingId == null || !Number.isSafeInteger(bookingId) || bookingId <= 0) {
    return "/(app)/notifications";
  }
  return data?.type === "new_ride_offer" ? `/offer/${bookingId}?returnTo=alerts` : `/trip/${bookingId}?returnTo=alerts`;
}
