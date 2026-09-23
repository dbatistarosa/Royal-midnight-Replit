/**
 * Native push is intentionally disabled until Firebase/FCM credentials are
 * configured for com.royalmidnight.driver. Keeping this boundary as a no-op
 * lets the driver app launch and use its in-app notification center safely.
 */
export async function registerForPushNotifications(_driverId: number): Promise<void> {
  return;
}
