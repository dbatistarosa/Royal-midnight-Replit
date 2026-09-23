import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { startLocationSharing, stopLocationSharing } from "@/location/locationTask";

export function useLocationSharing() {
  const [isSharing, setIsSharing] = useState(false);
  const [needsAlwaysUpgrade, setNeedsAlwaysUpgrade] = useState(false);

  const start = useCallback(async () => {
    const result = await startLocationSharing();
    if (!result.ok) {
      Alert.alert(
        "Location required",
        "Royal Midnight needs location access to show you ride offers and share your position with dispatch. Please enable it in Settings.",
      );
      return false;
    }
    const upgrade = result.reason === "background_not_granted";
    setIsSharing(true);
    setNeedsAlwaysUpgrade(upgrade);
    // Computed and returned here, not read back from state: setNeedsAlwaysUpgrade
    // above won't have committed by the time the caller's next line runs, so a
    // caller checking the hook's own needsAlwaysUpgrade right after awaiting
    // start() would always see the value from before this call.
    if (upgrade) {
      Alert.alert(
        "Limited background tracking",
        "Location is only shared while Royal Midnight is open. For dispatch to track you when the app is backgrounded or the screen is locked, set Location permission to \"Always\" in Settings.",
      );
    }
    return true;
  }, []);

  const stop = useCallback(async () => {
    await stopLocationSharing();
    setIsSharing(false);
  }, []);

  return { isSharing, needsAlwaysUpgrade, start, stop };
}
