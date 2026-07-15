export interface AuthUser {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: "driver" | "admin" | "passenger" | "corporate";
  createdAt: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
  driverId?: number;
}

export interface Driver {
  id: number;
  userId: number | null;
  name: string;
  email: string;
  phone: string;
  licenseNumber: string | null;
  status: "pending" | "available" | "on_break" | "unavailable" | "active";
  isOnline: boolean;
  rating: number | null;
  totalRides: number;
  vehicleYear: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  vehicleClass: string | null;
  passengerCapacity: number | null;
  luggageCapacity: number | null;
  hasCarSeat: boolean | null;
  serviceArea: string | null;
  approvalStatus: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  latitude: string | null;
  longitude: string | null;
  locationUpdatedAt: string | null;
  profilePicture: string | null;
  complianceHold: boolean;
  createdAt: string;
}

export interface PassengerPreferences {
  cabinTempF?: number | null;
  musicPreference?: string | null;
  quietRide?: boolean | null;
  preferredBeverage?: string | null;
  opensOwnDoor?: boolean | null;
  addressTitle?: string | null;
  vipNotes?: string | null;
}

export type BookingStatus =
  | "pending"
  | "awaiting_payment"
  | "authorized"
  | "confirmed"
  | "on_way"
  | "on_location"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface DriverBooking {
  id: number;
  passengerName: string;
  passengerPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string;
  vehicleClass: string;
  passengers: number;
  luggageCount: number;
  flightNumber: string | null;
  specialRequests: string | null;
  status: BookingStatus;
  driverEarnings: number;
  tipAmount: number | null;
  charterMode: "route" | "hourly" | null;
  charterHours: number | null;
  checklistCompletedAt: string | null;
  tripStartedAt: string | null;
  tripEndedAt: string | null;
  extraCharge: number | null;
  totalPrice: number | null;
  driverId: number | null;
  passengerPreferences?: PassengerPreferences;
}

export interface DriverEarnings {
  totalEarnings: number;
  thisMonth: number;
  thisWeek: number;
  today: number;
  totalRides: number;
  avgPerRide: number;
  commissionAllTime: number;
  commissionThisWeek: number;
  tipsTotal: number;
  tipsThisWeek: number;
  tipsToday: number;
  periodEarnings: number;
  periodRides: number;
  periodTips: number;
  commissionPct: number;
  recentPayouts: { date: string; rides: number; amount: number }[];
}

export interface DocumentSubmission {
  id: number;
  driverId: number;
  docType: "Driver License" | "Vehicle Registration" | "Insurance";
  status: "pending_review" | "approved" | "rejected";
  fileUrl: string;
  newExpiry: string | null;
  adminNotes: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface DriverDocuments {
  currentExpiries: Record<string, string | undefined>;
  complianceHold: boolean;
  submissions: DocumentSubmission[];
}

export interface DriverPayout {
  payoutLegalName: string | null;
  payoutEmail: string | null;
  payoutBankName: string | null;
  hasSsn: boolean;
  ssnLast4: string | null;
  hasRoutingNumber: boolean;
  routingLast4: string | null;
  hasAccountNumber: boolean;
  accountLast4: string | null;
}

export interface DriverReview {
  id: number;
  bookingId: number;
  driverId: number;
  userId: number | null;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface AppNotification {
  id: number;
  userId: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  bookingId: number | null;
  createdAt: string;
}

export interface SupportTicket {
  id: number;
  userId: number | null;
  bookingId: number | null;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessage {
  id: number;
  ticketId: number;
  userId: number | null;
  authorRole: "driver" | "admin" | "passenger";
  message: string;
  createdAt: string;
}

export interface FlightStatus {
  available: boolean;
  reason?: string;
  status?: string;
  [key: string]: unknown;
}

export interface DriverVehicle {
  id: number;
  driverId: number;
  make: string;
  model: string;
  year: number;
  color: string;
  regPlate: string | null;
  vehicleClass: string | null;
  passengerCapacity: number | null;
  luggageCapacity: number | null;
  hasCarSeat: boolean;
  isDefault: boolean;
  createdAt: string;
}

export interface VehicleCatalogEntry {
  id: number;
  make: string;
  model: string;
  minYear: number;
  vehicleTypes: string[];
}
