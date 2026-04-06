import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { API_BASE } from "@/lib/constants";

export interface DriverRecord {
  id: number;
  approvalStatus: string;
  rejectionReason?: string | null;
  name: string;
  status: string;
}

interface DriverStatusContextValue {
  driverRecord: DriverRecord | null;
  isLoading: boolean;
  refetch: () => void;
}

const DriverStatusContext = createContext<DriverStatusContextValue | null>(null);

export function DriverStatusProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [driverRecord, setDriverRecord] = useState<DriverRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user?.id || !token || user.role !== "driver") {
      setDriverRecord(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetch(`${API_BASE}/drivers/by-user/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() as Promise<DriverRecord> : Promise.reject(new Error("Not found")))
      .then(d => setDriverRecord(d))
      .catch(() => setDriverRecord(null))
      .finally(() => setIsLoading(false));
  }, [user?.id, token, user?.role, tick]);

  const refetch = () => setTick(t => t + 1);

  return (
    <DriverStatusContext.Provider value={{ driverRecord, isLoading, refetch }}>
      {children}
    </DriverStatusContext.Provider>
  );
}

export function useDriverStatus() {
  const ctx = useContext(DriverStatusContext);
  if (!ctx) throw new Error("useDriverStatus must be used inside DriverStatusProvider");
  return ctx;
}
