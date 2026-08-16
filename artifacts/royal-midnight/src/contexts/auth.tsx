import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { API_BASE } from "@/lib/constants";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: "passenger" | "driver" | "admin" | "corporate";
  driverId?: number | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  driverId: number | null;
  login: (user: AuthUser, token: string, driverId?: number | null) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "rm_auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // The session token is NOT persisted. It lives in an HttpOnly cookie that
  // page JavaScript cannot read, so an XSS can no longer steal a 30-day admin
  // session (CN-014). Only non-sensitive display fields are cached here so the
  // UI can render immediately on reload; the cookie is what actually
  // authenticates, and it is sent automatically because the API is same-origin.
  useEffect(() => {
    let cancelled = false;

    // Restore immediately so the shell can paint, then confirm with the server.
    let restored: AuthUser | null = null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { user: AuthUser; driverId?: number | null };
        restored = parsed.user;
        setUser(parsed.user);
        setDriverId(parsed.driverId ?? null);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }

    if (!restored) {
      setIsLoading(false);
      return;
    }

    // The cached user says nothing about whether the session behind it is still
    // alive. Without this check an expired or revoked session rendered a normal
    // dashboard that simply stayed empty — AuthGuard saw a user and let the page
    // through, then every data call came back 401 with nothing listening. The
    // server's answer is also authoritative for `role`, so a localStorage blob
    // edited in DevTools self-corrects instead of unlocking the admin shell.
    fetch(`${API_BASE}/auth/me`, { credentials: "include" })
      .then(async res => {
        if (cancelled) return;
        if (res.status === 401) {
          clearSession();
          return;
        }
        if (!res.ok) return; // network/server hiccup: keep the cached user
        const data = await res.json() as { user: AuthUser; driverId?: number | null };
        setUser(data.user);
        setDriverId(data.driverId ?? null);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: data.user, driverId: data.driverId ?? null }));
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, []);

  /** Drop everything we know about the session. Used both by logout and when the
   *  server tells us the session is gone. */
  function clearSession() {
    setUser(null);
    setToken(null);
    setDriverId(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  useEffect(() => {
    setAuthTokenGetter(token ? () => token : null);
  }, [token]);

  function login(user: AuthUser, token: string, driverIdArg?: number | null) {
    const did = driverIdArg ?? null;
    setUser(user);
    // Kept in memory only, for the current tab. After a reload it is gone and
    // requests authenticate with the cookie instead.
    setToken(token);
    setDriverId(did);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, driverId: did }));
  }

  function logout() {
    clearSession();
    // The cookie is HttpOnly, so only the server can clear it.
    void fetch(`${API_BASE}/auth/logout`, { method: "POST" }).catch(() => undefined);
  }

  // A session can also die mid-visit — it expires, an admin revokes it, or a
  // password reset invalidates it. Pages here call fetch directly in dozens of
  // places, so rather than touching every call site this watches responses once
  // and reacts to the only status that means "your session is gone". Login and
  // logout are excluded: a 401 there is a wrong password, not an expiry.
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await original(...args);
      try {
        if (response.status === 401) {
          const url = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url ?? "";
          const isApiCall = url.includes(`${API_BASE}/`);
          const isCredentialCheck = url.includes("/auth/login") || url.includes("/auth/logout");
          if (isApiCall && !isCredentialCheck) clearSession();
        }
      } catch {
        // Never let this bookkeeping break the caller's request.
      }
      return response;
    };
    return () => { window.fetch = original; };
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, driverId, login, logout, isAuthenticated: !!user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
