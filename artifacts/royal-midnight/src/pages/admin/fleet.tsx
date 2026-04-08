import { useState, useEffect, useCallback } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { LayoutDashboard, Calendar, Users, Car, Map, DollarSign, Tag, MessageSquare, BarChart, Settings, Loader2, CheckCircle, XCircle, Wallet } from "lucide-react";
import { API_BASE } from "@/lib/constants";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";

const adminNavItems = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Bookings", href: "/admin/bookings", icon: Calendar },
  { label: "Dispatch", href: "/admin/dispatch", icon: Map },
  { label: "Passengers", href: "/admin/passengers", icon: Users },
  { label: "Drivers", href: "/admin/drivers", icon: Users },
  { label: "Fleet", href: "/admin/fleet", icon: Car },
  { label: "Pricing", href: "/admin/pricing", icon: DollarSign },
  { label: "Promos", href: "/admin/promos", icon: Tag },
  { label: "Support", href: "/admin/support", icon: MessageSquare },
  { label: "Reports", href: "/admin/reports", icon: BarChart },
  { label: "Payouts", href: "/admin/payouts", icon: Wallet },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

type Vehicle = {
  id: number;
  make: string;
  model: string;
  year: number;
  color: string;
  plate: string;
  vehicleClass: string;
  capacity: number;
  isAvailable: boolean;
  imageUrl: string | null;
  driverId: number | null;
};

const CLASS_LABELS: Record<string, string> = {
  standard: "Standard",
  business: "Business",
  first_class: "First Class",
  suv: "SUV",
  van: "Van",
};

export default function AdminFleet() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const authHdr = token ? `Bearer ${token}` : "";

  const fetchVehicles = useCallback(() => {
    if (!token) return;
    setIsLoading(true);
    fetch(`${API_BASE}/vehicles`, { headers: { Authorization: authHdr } })
      .then(r => r.ok ? r.json() as Promise<Vehicle[]> : Promise.resolve([]))
      .then(data => setVehicles(Array.isArray(data) ? data : []))
      .catch(() => setVehicles([]))
      .finally(() => setIsLoading(false));
  }, [token, authHdr]);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  const handleToggleAvailability = async (vehicle: Vehicle) => {
    setTogglingId(vehicle.id);
    try {
      const res = await fetch(`${API_BASE}/vehicles/${vehicle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHdr },
        body: JSON.stringify({ isAvailable: !vehicle.isAvailable }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast({ title: "Updated", description: `${vehicle.make} ${vehicle.model} marked as ${!vehicle.isAvailable ? "available" : "unavailable"}.` });
      fetchVehicles();
    } catch {
      toast({ title: "Error", description: "Could not update vehicle availability.", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <PortalLayout title="Royal Admin" navItems={adminNavItems}>
      <h1 className="font-serif text-2xl sm:text-3xl mb-6 sm:mb-8">Fleet Management</h1>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : vehicles.length === 0 ? (
        <div className="bg-card border border-border p-12 text-center text-muted-foreground">
          No vehicles found.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vehicles.map(vehicle => (
            <div key={vehicle.id} className="bg-card border border-border p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-serif text-xl">{vehicle.make} {vehicle.model}</h3>
                  <p className="text-muted-foreground text-sm">{vehicle.year} · {vehicle.color}</p>
                </div>
                <button
                  onClick={() => void handleToggleAvailability(vehicle)}
                  disabled={togglingId === vehicle.id}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs border transition-colors ${
                    vehicle.isAvailable
                      ? "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20"
                      : "bg-red-500/10 text-red-500 border-red-500/20 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/20"
                  }`}
                >
                  {togglingId === vehicle.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : vehicle.isAvailable ? (
                    <CheckCircle className="w-3 h-3" />
                  ) : (
                    <XCircle className="w-3 h-3" />
                  )}
                  {vehicle.isAvailable ? "Available" : "Unavailable"}
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Class</span>
                  <span>{CLASS_LABELS[vehicle.vehicleClass] ?? vehicle.vehicleClass}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plate</span>
                  <span className="font-mono">{vehicle.plate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Capacity</span>
                  <span>{vehicle.capacity} passengers</span>
                </div>
                {vehicle.driverId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Driver ID</span>
                    <span>#{vehicle.driverId}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </PortalLayout>
  );
}
