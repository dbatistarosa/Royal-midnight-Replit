import { createContext, useContext, useEffect, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { useAuth } from "./auth";
import { API_BASE } from "@/lib/constants";

export interface DriverRecord {
  id: number;
  approvalStatus: string;
  rejectionReason?: string | null;
  name: string;
  status: string;
  isOnline: boolean;
  rating: number | null;
  totalRides: number;
  email: string;
  phone: string;
  vehicleYear?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleColor?: string | null;
  passengerCapacity?: number | null;
  luggageCapacity?: number | null;
  hasCarSeat?: boolean | null;
  serviceArea?: string | null;
  licenseNumber?: string | null;
  licenseExpiry?: string | null;
  profilePicture?: string | null;
}

interface DriverStatusContextValue {
  driverRecord: DriverRecord | null;
  isLoading: boolean;
  refetch: () => void;
  setDriverRecord: Dispatch<SetStateAction<DriverRecord | null>>;
}

const DriverStatusContext = createContext<DriverStatusContextValue | null>(null);

export function DriverStatusProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [driverRecord, setDriverRecord] = useState<DriverRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Gated on the user, NOT on the token.
    //
    // The bearer token is memory-only by design (CN-014 moved the session into
    // an HttpOnly cookie), so it is gone after any page reload. This effect used
    // to require it, so on refresh it set driverRecord to null and the dashboard
    // fell back to rendering the not-yet-approved state — a working chauffeur
    // was told their account was "pending" until they signed out and back in.
    //
    // The cookie is what actually authenticates, API_BASE is same-origin, and
    // fetch sends same-origin cookies by default. The header below is kept only
    // for the tab that still holds a token in memory.
    if (!user?.id || user.role !== "driver") {
      setDriverRecord(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetch(`${API_BASE}/drivers/by-user/${user.id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() as Promise<DriverRecord> : Promise.reject(new Error("Not found")))
      .then(d => setDriverRecord(d))
      .catch(() => setDriverRecord(null))
      .finally(() => setIsLoading(false));
  }, [user?.id, token, user?.role, tick]);

  const refetch = () => setTick(t => t + 1);

  return (
    <DriverStatusContext.Provider value={{ driverRecord, isLoading, refetch, setDriverRecord }}>
      {children}
    </DriverStatusContext.Provider>
  );
}

export function useDriverStatus() {
  const ctx = useContext(DriverStatusContext);
  if (!ctx) throw new Error("useDriverStatus must be used inside DriverStatusProvider");
  return ctx;
}
