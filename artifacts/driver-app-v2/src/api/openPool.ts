export function uniqueBookingsById<T extends { id: number }>(bookings: readonly T[]): T[] {
  const seen = new Set<number>();
  return bookings.filter((booking) => {
    if (seen.has(booking.id)) return false;
    seen.add(booking.id);
    return true;
  });
}

export function findOpenPoolBooking<T extends { id: number }>(
  bookings: readonly T[],
  bookingId: number,
): T | null {
  if (!Number.isFinite(bookingId)) return null;
  return bookings.find((booking) => booking.id === bookingId) ?? null;
}
