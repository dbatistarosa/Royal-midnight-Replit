import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { useAuthStore } from "@/auth/store";
import { patchDriverLocation } from "@/api/driverApi";
import { configureApiClient } from "@/api/client";

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
  if (!useAuthStore.getState().isHydrated)
    await useAuthStore.getState().hydrate();
  configureApiClient();
  const { driverId } = useAuthStore.getState();
  if (!driverId) return;

  const locations = (data as { locations?: Location.LocationObject[] })
    ?.locations;
  const latest = locations?.[locations.length - 1];
  if (!latest) return;

  try {
    await patchDriverLocation(
      driverId,
      latest.coords.latitude,
      latest.coords.longitude,
    );
  } catch (err) {
    console.error("[location-task] failed to report location:", err);
  }
});

const LOCATION_INTERVAL_MS = 30_000;
let foregroundSubscription: Location.LocationSubscription | null = null;

async function reportLocation(location: Location.LocationObject): Promise<void> {
  const { driverId } = useAuthStore.getState();
  if (!driverId) return;

  configureApiClient();
  try {
    await patchDriverLocation(
      driverId,
      location.coords.latitude,
      location.coords.longitude,
    );
  } catch (err) {
    console.error("[location] failed to report location:", err);
  }
}

async function startForegroundFallback(): Promise<void> {
  if (foregroundSubscription) return;
  foregroundSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: LOCATION_INTERVAL_MS,
      distanceInterval: 50,
    },
    (location) => void reportLocation(location),
  );
}

export async function startLocationSharing(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const { status: fgStatus } =
    await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== "granted") {
    return { ok: false, reason: "foreground_denied" };
  }

  // Only ask for background access at the moment the driver actually goes
  // online — never pre-emptively on first launch.
  const { status: bgStatus } =
    await Location.requestBackgroundPermissionsAsync();

  if (bgStatus === "granted") {
    const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(
      LOCATION_TASK_NAME,
    ).catch(() => false);
    if (!alreadyStarted) {
      try {
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
      } catch (err) {
        console.warn("[location] background tracking unavailable:", err);
        await startForegroundFallback();
        return { ok: true, reason: "background_unavailable" };
      }
    }
  } else {
    // A driver can still work while the app is open when Android declines
    // background access. Do not pretend that a background task started: use
    // the foreground watcher and clearly report the reduced capability to the
    // UI so the driver can upgrade the permission later.
    await startForegroundFallback();
  }

  return {
    ok: true,
    reason: bgStatus !== "granted" ? "background_not_granted" : undefined,
  };
}

export async function stopLocationSharing(): Promise<void> {
  foregroundSubscription?.remove();
  foregroundSubscription = null;
  const started = await Location.hasStartedLocationUpdatesAsync(
    LOCATION_TASK_NAME,
  ).catch(() => false);
  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}
