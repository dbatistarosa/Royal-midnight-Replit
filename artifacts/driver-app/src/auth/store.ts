import Constants from "expo-constants";
import { queryClient } from "@/api/queryClient";
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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  driverId: null,
  isHydrated: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredAuth;
        if(!parsed?.token||!parsed.user?.id)throw new Error('Invalid stored session');
        const base=Constants.expoConfig?.extra?.apiBaseUrl??'https://www.royalmidnight.com/api';
        const response=await fetch(base+'/auth/me',{headers:{Authorization:'Bearer '+parsed.token},signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new Error('Session could not be verified');
        const current=await response.json();
        set({ user: current.user, token: parsed.token, driverId: current.driverId??null, isHydrated: true });
        return;
      }
    } catch {
      // corrupt stored value — fall through to a clean logged-out state
    }
    set({ user:null,token:null,driverId:null,isHydrated: true });
  },

  login: async (user, token, driverId) => {
    const stored: StoredAuth = { user, token, driverId };
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(stored));
    await queryClient.cancelQueries();queryClient.clear();
    set({ user, token, driverId });
  },

  logout: async () => {
    const token=get().token;
    set({user:null,token:null,driverId:null});
    await queryClient.cancelQueries();queryClient.clear();
    const {stopLocationSharing}=await import('@/location/locationTask');
    await stopLocationSharing().catch(()=>{});
    try{await SecureStore.deleteItemAsync(STORAGE_KEY);}
    catch{await SecureStore.setItemAsync(STORAGE_KEY,'null').catch(()=>{});}
    const base=Constants.expoConfig?.extra?.apiBaseUrl??'https://www.royalmidnight.com/api';
    if(token)await fetch(base+'/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)}).catch(()=>{});
  },
}));
