import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  setAuthTokenGetter,
  setUnauthorizedHandler,
} from "@workspace/api-client-react";
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
  login: (user: AuthUser, driverId?: number | null) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const revision = useRef(0);
  const loggedOut = useRef(false);
  const clearSession = useCallback(() => {
    revision.current++;
    setUser(null);
    setToken(null);
    setDriverId(null);
    setAuthTokenGetter(null);
    void queryClient.cancelQueries();
    queryClient.clear();
    try {
      localStorage.removeItem("rm_auth");
    } catch {
      /* Storage may be disabled. */
    }
  }, [queryClient]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function checkSession() {
      if (loggedOut.current) {
        setIsLoading(false);
        return;
      }
      const started = revision.current;
      try {
        const response = await fetch(API_BASE + "/auth/me", {
          credentials: "include",
          signal: controller.signal,
        });
        if (!active || started !== revision.current) return;
        if (response.status === 401) {
          clearSession();
          return;
        }
        if (!response.ok) return;
        const data = (await response.json()) as {
          user: AuthUser;
          driverId?: number | null;
        };
        if (!active || started !== revision.current) return;
        setUser(data.user);
        setDriverId(data.driverId ?? null);
      } catch {
        /* A temporary outage does not revoke an established session. */
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void checkSession();
    const focus = () => {
      void checkSession();
    };
    window.addEventListener("focus", focus);
    const timer = window.setInterval(focus, 60000);
    setUnauthorizedHandler(clearSession);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      setUnauthorizedHandler(null);
    };
  }, [clearSession]);
  function login(
    nextUser: AuthUser,
    nextDriverId?: number | null,
  ) {
    loggedOut.current = false;
    clearSession();
    setUser(nextUser);
    // Web authentication is cookie-only. Keeping a bearer token in React state
    // would make accidental token exposure in browser code easy again.
    setToken(null);
    setDriverId(nextDriverId ?? null);
    setIsLoading(false);
    setAuthTokenGetter(null);
  }
  async function logout() {
    loggedOut.current = true;
    const currentToken = token;
    clearSession();
    try {
      for (const key of [
        "rm_checkout_request",
        "rm_pending_booking_id",
        "rm_pending_booking_token",
        "rm_booking_draft",
      ])
        sessionStorage.removeItem(key);
    } catch {}
    await fetch(API_BASE + "/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: currentToken ? { Authorization: "Bearer " + currentToken } : {},
    }).catch(() => undefined);
  }
  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        driverId,
        login,
        logout,
        isAuthenticated: !!user,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
