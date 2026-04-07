import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

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

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { user: AuthUser; token: string; driverId?: number | null };
        setUser(parsed.user);
        setToken(parsed.token);
        setDriverId(parsed.driverId ?? null);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  function login(user: AuthUser, token: string, driverIdArg?: number | null) {
    const did = driverIdArg ?? null;
    setUser(user);
    setToken(token);
    setDriverId(did);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token, driverId: did }));
  }

  function logout() {
    setUser(null);
    setToken(null);
    setDriverId(null);
    localStorage.removeItem(STORAGE_KEY);
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
