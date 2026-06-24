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
    setIsSharing(true);
    setNeedsAlwaysUpgrade(result.reason === "background_not_granted");
    return true;
  }, []);

  const stop = useCallback(async () => {
    await stopLocationSharing();
    setIsSharing(false);
  }, []);

  return { isSharing, needsAlwaysUpgrade, start, stop };
}
