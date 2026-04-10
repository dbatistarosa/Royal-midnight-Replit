export const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

export const AIRPORTS = [
  { value: "FLL", label: "Fort Lauderdale-Hollywood Int. (FLL)" },
  { value: "MIA", label: "Miami International (MIA)" },
  { value: "PBI", label: "Palm Beach International (PBI)" },
];

export const VEHICLE_CLASSES = [
  { id: "business", name: "Business Class Sedan", passengers: 3, bags: 3, image: "/business.webp", description: "Elevated amenities for the discerning professional. Immaculate leather interior, climate control, and complimentary water service." },
  { id: "suv", name: "Premium SUV", passengers: 6, bags: 6, image: "/suv.webp", description: "The 2026 Chevrolet Suburban — commanding presence, expansive cabin, and superior comfort for groups and families traveling in style." },
];

export const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  confirmed: "bg-primary/10 text-primary border-primary/20",
  in_progress: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  completed: "bg-green-500/10 text-green-500 border-green-500/20",
  cancelled: "bg-red-500/10 text-red-500 border-red-500/20",
};
