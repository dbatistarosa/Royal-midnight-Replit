export const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

export const AIRPORTS = [
  { value: "FLL", label: "Fort Lauderdale-Hollywood Int. (FLL)" },
  { value: "MIA", label: "Miami International (MIA)" },
  { value: "PBI", label: "Palm Beach International (PBI)" },
];

export const VEHICLE_CLASSES = [
  { id: "standard", name: "Luxury Sedan", passengers: 3, bags: 3, image: "/standard.png", description: "Premium comfort for executive travel." },
  { id: "business", name: "Business Class Sedan", passengers: 3, bags: 3, image: "/business.png", description: "Elevated amenities for the modern professional." },
  { id: "first_class", name: "First Class Limousine", passengers: 3, bags: 4, image: "/first_class.png", description: "The ultimate expression of luxury and discretion." },
  { id: "suv", name: "Premium SUV", passengers: 6, bags: 6, image: "/suv.png", description: "Commanding presence with expansive cabin space." },
  { id: "van", name: "Executive Van", passengers: 10, bags: 10, image: "/van.png", description: "First-class group transport without compromise." },
];

export const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  confirmed: "bg-primary/10 text-primary border-primary/20",
  in_progress: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  completed: "bg-green-500/10 text-green-500 border-green-500/20",
  cancelled: "bg-red-500/10 text-red-500 border-red-500/20",
};
