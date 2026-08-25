import { customFetch, type LoginBody, type UploadUrlRequest, type UploadUrlResponse } from "@workspace/api-client-react";
import type {
  AppNotification,
  Driver,
  DriverBooking,
  DriverDocuments,
  DriverEarnings,
  DriverPayout,
  DriverReview,
  DriverVehicle,
  FlightStatus,
  LoginResponse,
  PricingRule,
  SupportTicket,
  TicketMessage,
  VehicleCatalogEntry,
} from "@/api/types";

// ── Auth ─────────────────────────────────────────────────────────────────────

export function login(body: LoginBody): Promise<LoginResponse> {
  return customFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── Driver profile ───────────────────────────────────────────────────────────

export function getDriverByUserId(userId: number): Promise<Driver> {
  return customFetch<Driver>(`/drivers/by-user/${userId}`);
}

export function getDriver(driverId: number): Promise<Driver> {
  return customFetch<Driver>(`/drivers/${driverId}`);
}

export function patchDriverContact(
  driverId: number,
  body: { phone?: string; profilePicture?: string },
): Promise<Driver> {
  return customFetch<Driver>(`/drivers/${driverId}/contact`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function patchDriverStatus(
  driverId: number,
  status: "available" | "on_break" | "unavailable",
): Promise<Driver> {
  return customFetch<Driver>(`/drivers/${driverId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function patchDriverLocation(
  driverId: number,
  lat: number,
  lng: number,
): Promise<{ id: number; latitude: string; longitude: string; locationUpdatedAt: string }> {
  return customFetch(`/drivers/${driverId}/location`, {
    method: "PATCH",
    body: JSON.stringify({ lat, lng }),
  });
}

export function patchDriverPushToken(
  driverId: number,
  pushToken: string,
  pushPlatform: "ios" | "android",
): Promise<{ id: number; pushPlatform: string }> {
  return customFetch(`/drivers/${driverId}/push-token`, {
    method: "PATCH",
    body: JSON.stringify({ pushToken, pushPlatform }),
  });
}

// ── Payout ───────────────────────────────────────────────────────────────────

export function getDriverPayout(driverId: number): Promise<DriverPayout> {
  return customFetch<DriverPayout>(`/drivers/${driverId}/payout`);
}

export function patchDriverPayout(
  driverId: number,
  body: {
    payoutLegalName?: string;
    payoutEmail?: string;
    payoutBankName?: string;
    payoutRoutingNumber?: string;
    payoutAccountNumber?: string;
  },
): Promise<DriverPayout> {
  return customFetch<DriverPayout>(`/drivers/${driverId}/payout`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// ── Compliance documents ─────────────────────────────────────────────────────

export function getDriverDocuments(driverId: number): Promise<DriverDocuments> {
  return customFetch<DriverDocuments>(`/drivers/${driverId}/documents`);
}

export function postDriverDocument(
  driverId: number,
  body: { docType: string; fileUrl: string; newExpiry?: string },
): Promise<DriverDocuments["submissions"][number]> {
  return customFetch(`/drivers/${driverId}/documents`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── Earnings ─────────────────────────────────────────────────────────────────

export function getDriverEarnings(
  driverId: number,
  range?: { startDate: string; endDate: string },
): Promise<DriverEarnings> {
  const qs = range ? `?startDate=${encodeURIComponent(range.startDate)}&endDate=${encodeURIComponent(range.endDate)}` : "";
  return customFetch<DriverEarnings>(`/drivers/${driverId}/earnings${qs}`);
}

// ── Bookings / trip lifecycle ────────────────────────────────────────────────

export function listBookings(params: { status?: string; driverId?: number }): Promise<DriverBooking[]> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.driverId != null) qs.set("driverId", String(params.driverId));
  return customFetch<DriverBooking[]>(`/bookings?${qs.toString()}`);
}

export function getBooking(bookingId: number): Promise<DriverBooking> {
  return customFetch<DriverBooking>(`/bookings/${bookingId}`);
}

// Note: these trip-lifecycle endpoints return the RAW booking row (with
// `priceQuoted`, not the driver-view `driverEarnings` substitution that
// GET /bookings and GET /bookings/:id apply). The app never reads fields off
// these mutation results directly — every screen re-fetches via useBooking()
// after invalidation, which DOES get the driver-view shape — so this is only
// typed as a minimal, accurate shape rather than the full DriverBooking.
interface BookingActionResult {
  id: number;
  status: string;
}

export function acceptBooking(bookingId: number, vehicleId?: number): Promise<BookingActionResult> {
  return customFetch(`/bookings/${bookingId}/accept`, {
    method: "POST",
    ...(vehicleId != null ? { body: JSON.stringify({ vehicleId }) } : {}),
  });
}

export function postTripChecklist(bookingId: number): Promise<{ ok: true; checklistCompletedAt: string }> {
  return customFetch(`/bookings/${bookingId}/trip/checklist`, { method: "POST" });
}

export function postTripOnWay(bookingId: number): Promise<BookingActionResult> {
  return customFetch(`/bookings/${bookingId}/trip/on-way`, { method: "POST" });
}

export function postTripOnLocation(bookingId: number): Promise<BookingActionResult> {
  return customFetch(`/bookings/${bookingId}/trip/on-location`, { method: "POST" });
}

export function postTripStart(bookingId: number): Promise<BookingActionResult> {
  return customFetch(`/bookings/${bookingId}/trip/start`, { method: "POST" });
}

export function postTripComplete(bookingId: number): Promise<BookingActionResult> {
  return customFetch(`/bookings/${bookingId}/trip/complete`, { method: "POST" });
}

export function getFlightStatus(bookingId: number): Promise<FlightStatus> {
  return customFetch<FlightStatus>(`/bookings/${bookingId}/flight-status`);
}

// ── Reviews ──────────────────────────────────────────────────────────────────

export function listDriverReviews(driverId: number): Promise<DriverReview[]> {
  return customFetch<DriverReview[]>(`/reviews?driverId=${driverId}`);
}

// ── Notifications ────────────────────────────────────────────────────────────

export function listNotifications(userId: number): Promise<AppNotification[]> {
  return customFetch<AppNotification[]>(`/notifications?userId=${userId}`);
}

export function markNotificationRead(notificationId: number): Promise<AppNotification> {
  return customFetch<AppNotification>(`/notifications/${notificationId}/read`, { method: "PATCH" });
}

// ── Support ──────────────────────────────────────────────────────────────────

export function listSupportTickets(): Promise<SupportTicket[]> {
  return customFetch<SupportTicket[]>(`/support`);
}

export function createSupportTicket(body: {
  name: string;
  email: string;
  subject: string;
  message: string;
  priority?: "low" | "medium" | "high" | "urgent";
}): Promise<SupportTicket> {
  return customFetch<SupportTicket>(`/support`, {
    method: "POST",
    body: JSON.stringify({ priority: "medium", ...body }),
  });
}

export function listTicketMessages(ticketId: number): Promise<TicketMessage[]> {
  return customFetch<TicketMessage[]>(`/support/${ticketId}/messages`);
}

export function postTicketMessage(ticketId: number, message: string): Promise<TicketMessage> {
  return customFetch<TicketMessage>(`/support/${ticketId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

// ── Vehicles ─────────────────────────────────────────────────────────────────

export function getDriverVehicles(driverId: number): Promise<DriverVehicle[]> {
  return customFetch<DriverVehicle[]>(`/drivers/${driverId}/vehicles`);
}

export function postDriverVehicle(
  driverId: number,
  body: {
    make: string;
    model: string;
    year: number;
    color: string;
    regPlate?: string;
    vehicleClass?: string;
    passengerCapacity?: number;
    luggageCapacity?: number;
    hasCarSeat?: boolean;
    isDefault?: boolean;
  },
): Promise<DriverVehicle> {
  return customFetch<DriverVehicle>(`/drivers/${driverId}/vehicles`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchDriverVehicle(
  driverId: number,
  vehicleId: number,
  body: Partial<{
    make: string;
    model: string;
    year: number;
    color: string;
    regPlate: string;
    vehicleClass: string;
    passengerCapacity: number;
    luggageCapacity: number;
    hasCarSeat: boolean;
    isDefault: boolean;
  }>,
): Promise<DriverVehicle> {
  return customFetch<DriverVehicle>(`/drivers/${driverId}/vehicles/${vehicleId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteDriverVehicle(driverId: number, vehicleId: number): Promise<void> {
  return customFetch<void>(`/drivers/${driverId}/vehicles/${vehicleId}`, {
    method: "DELETE",
  });
}

/** Live vehicle classes, same source of truth the web app's useVehicleClasses()
 *  reads (admin-configurable pricing_rules) — the account/vehicle.tsx dropdown
 *  used to be its own hardcoded 5-value list, independent of whatever admin
 *  actually configured at /admin/pricing. */
export function getPricingRules(): Promise<PricingRule[]> {
  return customFetch<PricingRule[]>(`/pricing`);
}

export async function getVehicleCatalog(): Promise<VehicleCatalogEntry[]> {
  // The public route returns vehicleTypes as a comma-joined string — normalize.
  const rows = await customFetch<Array<Omit<VehicleCatalogEntry, "vehicleTypes"> & { vehicleTypes: string }>>(`/vehicle-catalog`);
  return rows.map(r => ({
    ...r,
    vehicleTypes: r.vehicleTypes.split(",").map(t => t.trim()).filter(Boolean),
  }));
}

// ── Document/photo upload (presigned URL contract) ──────────────────────────

// Not requestUploadUrlGenerated from @workspace/api-client-react: its URL
// helper returns "/api/storage/uploads/request-url" (correct for the web
// app, which never sets a base URL — its /api/* paths resolve against the
// same origin). This app's client.ts calls setBaseUrl with
// "https://royalmidnight.com/api" already included, so calling the
// generated function doubled the prefix into
// ".../api/api/storage/uploads/request-url", 404ing on every attempt.
// Every compliance document upload — and the only way out of a
// compliance-hold — was broken by this. Manual call instead, matching
// every other hand-written function in this file (no leading /api; the
// base URL already supplies it).
export function requestUploadUrl(name: string, size: number, contentType: string): Promise<UploadUrlResponse> {
  const body: UploadUrlRequest = { name, size, contentType };
  return customFetch<UploadUrlResponse>("/storage/uploads/request-url", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function uploadFileToPresignedUrl(uploadURL: string, localUri: string, contentType: string): Promise<void> {
  const file = await fetch(localUri);
  const blob = await file.blob();
  const res = await fetch(uploadURL, { method: "PUT", body: blob, headers: { "Content-Type": contentType } });
  if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`);
}
