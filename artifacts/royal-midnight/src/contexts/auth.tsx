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
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { user: AuthUser; driverId?: number | null };
        setUser(parsed.user);
        setDriverId(parsed.driverId ?? null);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
    setUser(null);
    setToken(null);
    setDriverId(null);
    localStorage.removeItem(STORAGE_KEY);
    // The cookie is HttpOnly, so only the server can clear it.
    void fetch(`${API_BASE}/auth/logout`, { method: "POST" }).catch(() => undefined);
  }

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
