import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import type { AuthUser } from "@/api/types";

const STORAGE_KEY = "rm_driver_auth";

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
  login: (user: AuthUser, token: string, driverId: number | null) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  driverId: null,
  isHydrated: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredAuth;
        set({ user: parsed.user, token: parsed.token, driverId: parsed.driverId, isHydrated: true });
        return;
      }
    } catch {
      // corrupt stored value — fall through to a clean logged-out state
    }
    set({ isHydrated: true });
  },

  login: async (user, token, driverId) => {
    const stored: StoredAuth = { user, token, driverId };
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(stored));
    set({ user, token, driverId });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
    set({ user: null, token: null, driverId: null });
  },
}));
