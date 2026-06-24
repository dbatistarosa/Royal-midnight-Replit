import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { useAuthStore } from "@/auth/store";
import { patchDriverLocation } from "@/api/driverApi";

export const LOCATION_TASK_NAME = "royal-midnight-driver-location";

// Must be registered at module scope (before any component mounts) — Expo's
// background location API requires the task to exist before
// startLocationUpdatesAsync is called, even though it's only actually used
// once a driver goes online.
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("[location-task] error:", error.message);
    return;
  }
  const { driverId } = useAuthStore.getState();
  if (!driverId) return;

  const locations = (data as { locations?: Location.LocationObject[] })?.locations;
  const latest = locations?.[locations.length - 1];
  if (!latest) return;

  try {
    await patchDriverLocation(driverId, latest.coords.latitude, latest.coords.longitude);
  } catch (err) {
    console.error("[location-task] failed to report location:", err);
  }
});

const LOCATION_INTERVAL_MS = 30_000;

export async function startLocationSharing(): Promise<{ ok: boolean; reason?: string }> {
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== "granted") {
    return { ok: false, reason: "foreground_denied" };
  }

  // Only ask for background access at the moment the driver actually goes
  // online — never pre-emptively on first launch.
  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();

  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (!alreadyStarted) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: LOCATION_INTERVAL_MS,
      distanceInterval: 50,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Royal Midnight — Online",
        notificationBody: "Sharing your location while you're online.",
      },
    });
  }

  return { ok: true, reason: bgStatus !== "granted" ? "background_not_granted" : undefined };
}

export async function stopLocationSharing(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}
