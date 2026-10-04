import Constants from "expo-constants";
import { queryClient } from "@/api/queryClient";
import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import type { AuthUser } from "@/api/types";
import { shouldDiscardStoredSession } from "@/auth/sessionHydration";

const STORAGE_KEY = "rm_driver_auth";
let authRevision = 0;
let storageWrite: Promise<void> = Promise.resolve();
const writeStorage = (operation: () => Promise<void>) => {
  storageWrite = storageWrite.catch(() => {}).then(operation);
  return storageWrite;
};

interface StoredAuth {
  user: AuthUser;
  token: string;
  driverId: number | null;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  driverId: number | null;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  login: (
    user: AuthUser,
    token: string,
    driverId: number | null,
  ) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  driverId: null,
  isHydrated: false,

  hydrate: async () => {
    const revision = authRevision;
    let stored: StoredAuth | null = null;
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) stored = JSON.parse(raw) as StoredAuth;
      if (stored && (!stored.token || !stored.user?.id)) stored = null;
    } catch {
      stored = null;
    }

    if (!stored) {
      if (revision === authRevision)
        set({ user: null, token: null, driverId: null, isHydrated: true });
      await writeStorage(() => SecureStore.deleteItemAsync(STORAGE_KEY)).catch(() => {});
      return;
    }

    try {
        const base =
          Constants.expoConfig?.extra?.apiBaseUrl ??
          "https://www.royalmidnight.com/api";
        const response = await fetch(base + "/auth/me", {
          headers: { Authorization: "Bearer " + stored.token },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          if (shouldDiscardStoredSession(response.status)) {
            if (revision === authRevision)
              set({ user: null, token: null, driverId: null, isHydrated: true });
            await writeStorage(() => SecureStore.deleteItemAsync(STORAGE_KEY)).catch(() => {});
            return;
          }
          throw new Error("Session verification temporarily unavailable");
        }
        const current = await response.json();
        if (revision !== authRevision) return;
        set({
          user: current.user,
          token: stored.token,
          driverId: current.driverId ?? null,
          isHydrated: true,
        });
        return;
    } catch {
      // A timeout, offline launch or server error must not erase a valid saved
      // login. Hydrate the last known identity; authenticated API calls will
      // still reject and clear it if the token is actually expired/revoked.
    }
    if (revision === authRevision) {
      set({ ...stored, isHydrated: true });
    }
  },

  login: async (user, token, driverId) => {
    const revision = ++authRevision;
    const stored: StoredAuth = { user, token, driverId };
    await writeStorage(() =>
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(stored)),
    );
    await queryClient.cancelQueries();
    queryClient.clear();
    if (revision === authRevision)
      set({ user, token, driverId, isHydrated: true });
  },

  logout: async () => {
    authRevision++;
    const token = get().token;
    set({ user: null, token: null, driverId: null, isHydrated: true });
    await queryClient.cancelQueries();
    queryClient.clear();
    const { stopLocationSharing } = await import("@/location/locationTask");
    await stopLocationSharing().catch(() => {});
    await writeStorage(async () => {
      try {
        await SecureStore.deleteItemAsync(STORAGE_KEY);
      } catch {
        await SecureStore.setItemAsync(STORAGE_KEY, "null").catch(() => {});
      }
    });
    const base =
      Constants.expoConfig?.extra?.apiBaseUrl ??
      "https://www.royalmidnight.com/api";
    if (token)
      await fetch(base + "/auth/logout", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        signal: AbortSignal.timeout(10000),
      }).catch(() => {});
  },
}));
