import Constants from "expo-constants";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { useAuthStore } from "@/auth/store";

export function configureApiClient(): void {
  const apiBaseUrl = (Constants.expoConfig?.extra?.["apiBaseUrl"] as string | undefined)
    ?? "https://royalmidnight.com/api";
  setBaseUrl(apiBaseUrl);
  setAuthTokenGetter(() => useAuthStore.getState().token);
}
