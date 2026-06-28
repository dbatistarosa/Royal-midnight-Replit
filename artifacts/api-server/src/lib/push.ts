/**
 * Expo push notification library — sends directly to Expo's push API, no SDK
 * or API key required for basic sends. Graceful no-op on individual failures
 * (a dead token shouldn't block the rest of a batch).
 */

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  const valid = messages.filter((m) => m.to?.startsWith("ExponentPushToken"));
  if (valid.length === 0) return;

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(valid),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[push] Expo push send failed (${res.status}):`, text.slice(0, 300));
    }
  } catch (err: any) {
    console.error("[push] Expo push send error:", err.message);
  }
}

export interface PushableDriver {
  pushToken: string | null;
  pushPlatform: string | null;
}

export async function sendNewRideOfferPush(
  drivers: PushableDriver[],
  booking: { id: number; pickupAddress: string; driverEarnings: number },
): Promise<void> {
  const messages: ExpoPushMessage[] = drivers
    .filter((d): d is PushableDriver & { pushToken: string } => !!d.pushToken)
    .map((d) => ({
      to: d.pushToken,
      title: "New Ride Available",
      body: `${booking.pickupAddress.split(",")[0]} — $${booking.driverEarnings.toFixed(2)} earnings`,
      data: { type: "new_ride_offer", bookingId: booking.id },
    }));
  await sendExpoPush(messages);
}

// Sent when an admin directly assigns a driver to a booking (not the open-pool
// self-accept flow) — without this, a directly-assigned driver has no signal
// that a trip exists until they happen to open the app.
export async function sendDriverAssignedPush(
  driver: PushableDriver,
  booking: { id: number; pickupAddress: string; driverEarnings: number },
): Promise<void> {
  if (!driver.pushToken) return;
  await sendExpoPush([{
    to: driver.pushToken,
    title: "New Trip Assigned",
    body: `${booking.pickupAddress.split(",")[0]} — $${booking.driverEarnings.toFixed(2)} earnings`,
    data: { type: "trip_assigned", bookingId: booking.id },
  }]);
}
