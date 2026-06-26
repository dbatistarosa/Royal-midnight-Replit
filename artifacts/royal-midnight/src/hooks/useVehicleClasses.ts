import { useListPricingRules } from "@workspace/api-client-react";

export interface VehicleClass {
  id: string;
  name: string;
  category: string;
  description: string;
  passengers: number;
  bags: number;
  image: string;
}

/**
 * Single source of truth for "what vehicle classes can a customer book right now."
 * Reads directly from the pricing_rules admin manages at /admin/pricing — a rule only
 * becomes a public, bookable class once it has vehicleClass, name, passengers, and an
 * image set. Fare-only rules (e.g. a surcharge with no display fields) are excluded.
 */
export function useVehicleClasses() {
  const { data, isLoading, error } = useListPricingRules();

  const vehicleClasses: VehicleClass[] = (data ?? [])
    .filter((r): r is typeof r & { vehicleClass: string; passengers: number; imageUrl: string } =>
      !!r.isActive && !!r.vehicleClass && !!r.name && r.passengers != null && !!r.imageUrl)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((r) => ({
      id: r.vehicleClass,
      name: r.name,
      category: r.category ?? "",
      description: r.description ?? "",
      passengers: r.passengers,
      bags: r.bags ?? r.passengers,
      image: r.imageUrl,
    }));

  return { vehicleClasses, isLoading, error };
}
