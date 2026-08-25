import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/api/driverApi";

export function useDriverByUserId(userId: number | null) {
  return useQuery({
    queryKey: ["driver", "by-user", userId],
    queryFn: () => api.getDriverByUserId(userId!),
    enabled: userId != null,
    refetchInterval: 30_000,
  });
}

export function useDriver(driverId: number | null) {
  return useQuery({
    queryKey: ["driver", driverId],
    queryFn: () => api.getDriver(driverId!),
    enabled: driverId != null,
  });
}

export function usePatchDriverStatus(driverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: "available" | "on_break" | "unavailable") => api.patchDriverStatus(driverId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["driver"] }),
  });
}

export function usePatchDriverContact(driverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { phone?: string; profilePicture?: string }) => api.patchDriverContact(driverId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["driver"] }),
  });
}

export function useDriverPayout(driverId: number | null) {
  return useQuery({
    queryKey: ["driver", driverId, "payout"],
    queryFn: () => api.getDriverPayout(driverId!),
    enabled: driverId != null,
  });
}

export function usePatchDriverPayout(driverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.patchDriverPayout>[1]) => api.patchDriverPayout(driverId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["driver", driverId, "payout"] }),
  });
}

export function useDriverDocuments(driverId: number | null) {
  return useQuery({
    queryKey: ["driver", driverId, "documents"],
    queryFn: () => api.getDriverDocuments(driverId!),
    enabled: driverId != null,
  });
}

export function usePostDriverDocument(driverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.postDriverDocument>[1]) => api.postDriverDocument(driverId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["driver", driverId, "documents"] }),
  });
}

export function useDriverEarnings(driverId: number | null, range?: { startDate: string; endDate: string }) {
  return useQuery({
    queryKey: ["driver", driverId, "earnings", range?.startDate, range?.endDate],
    queryFn: () => api.getDriverEarnings(driverId!, range),
    enabled: driverId != null,
  });
}

export function useOpenPoolBookings() {
  return useQuery({
    queryKey: ["bookings", "open-pool"],
    queryFn: async () => {
      const [pending, authorized] = await Promise.all([
        api.listBookings({ status: "pending" }),
        api.listBookings({ status: "authorized" }),
      ]);
      return [...pending, ...authorized];
    },
    refetchInterval: 15_000,
  });
}

export function useDriverBookings(driverId: number | null) {
  return useQuery({
    queryKey: ["bookings", "driver", driverId],
    queryFn: () => api.listBookings({ driverId: driverId! }),
    enabled: driverId != null,
    refetchInterval: 15_000,
  });
}

export function useBooking(bookingId: number | null) {
  return useQuery({
    queryKey: ["booking", bookingId],
    queryFn: () => api.getBooking(bookingId!),
    enabled: bookingId != null,
    refetchInterval: 10_000,
  });
}

function useTripMutation(invalidateBookingId?: number) {
  const qc = useQueryClient();
  return {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      if (invalidateBookingId != null) qc.invalidateQueries({ queryKey: ["booking", invalidateBookingId] });
    },
  };
}

export function useAcceptBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, vehicleId }: { bookingId: number; vehicleId?: number }) =>
      api.acceptBooking(bookingId, vehicleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
}

export function useTripChecklist(bookingId: number) {
  return useMutation({ mutationFn: () => api.postTripChecklist(bookingId), ...useTripMutation(bookingId) });
}

export function useTripOnWay(bookingId: number) {
  return useMutation({ mutationFn: () => api.postTripOnWay(bookingId), ...useTripMutation(bookingId) });
}

export function useTripOnLocation(bookingId: number) {
  return useMutation({ mutationFn: () => api.postTripOnLocation(bookingId), ...useTripMutation(bookingId) });
}

export function useTripStart(bookingId: number) {
  return useMutation({ mutationFn: () => api.postTripStart(bookingId), ...useTripMutation(bookingId) });
}

export function useTripComplete(bookingId: number) {
  return useMutation({ mutationFn: () => api.postTripComplete(bookingId), ...useTripMutation(bookingId) });
}

export function useDriverReviews(driverId: number | null) {
  return useQuery({
    queryKey: ["driver", driverId, "reviews"],
    queryFn: () => api.listDriverReviews(driverId!),
    enabled: driverId != null,
  });
}

export function useNotifications(userId: number | null) {
  return useQuery({
    queryKey: ["notifications", userId],
    queryFn: () => api.listNotifications(userId!),
    enabled: userId != null,
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: number) => api.markNotificationRead(notificationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useSupportTickets() {
  return useQuery({ queryKey: ["support", "tickets"], queryFn: api.listSupportTickets });
}

export function useCreateSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createSupportTicket,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support", "tickets"] }),
  });
}

export function useTicketMessages(ticketId: number | null) {
  return useQuery({
    queryKey: ["support", "tickets", ticketId, "messages"],
    queryFn: () => api.listTicketMessages(ticketId!),
    enabled: ticketId != null,
    refetchInterval: 10_000,
  });
}

export function usePostTicketMessage(ticketId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => api.postTicketMessage(ticketId, message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support", "tickets", ticketId, "messages"] }),
  });
}

export function useDriverVehicles(driverId: number | null) {
  return useQuery({
    queryKey: ["driver", driverId, "vehicles"],
    queryFn: () => api.getDriverVehicles(driverId!),
    enabled: driverId != null,
  });
}

export function usePostDriverVehicle(driverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.postDriverVehicle>[1]) => api.postDriverVehicle(driverId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["driver", driverId, "vehicles"] });
      qc.invalidateQueries({ queryKey: ["driver", driverId] });
    },
  });
}

export function usePatchDriverVehicle(driverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, body }: { vehicleId: number; body: Parameters<typeof api.patchDriverVehicle>[2] }) =>
      api.patchDriverVehicle(driverId, vehicleId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["driver", driverId, "vehicles"] });
      qc.invalidateQueries({ queryKey: ["driver", driverId] });
    },
  });
}

export function useDeleteDriverVehicle(driverId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vehicleId: number) => api.deleteDriverVehicle(driverId, vehicleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["driver", driverId, "vehicles"] });
      qc.invalidateQueries({ queryKey: ["driver", driverId] });
    },
  });
}

export function useVehicleCatalog() {
  return useQuery({
    queryKey: ["vehicle-catalog"],
    queryFn: api.getVehicleCatalog,
    staleTime: 5 * 60 * 1000,
  });
}

/** Bookable vehicle classes, live from admin-configured pricing rules —
 *  mirrors the web app's useVehicleClasses() so both surfaces agree on what
 *  classes exist without either one hardcoding its own copy. */
export function useVehicleClasses() {
  const { data, isLoading } = useQuery({
    queryKey: ["pricing-rules"],
    queryFn: api.getPricingRules,
    staleTime: 5 * 60 * 1000,
  });

  const vehicleClasses = (data ?? [])
    // passengers != null, matching the web app's equivalent filter: a rule
    // with vehicleClass set but passengers left empty is fare-only (e.g. an
    // airport surcharge row), not a real selectable class. Without this, a
    // driver registering a vehicle could pick a non-bookable pricing row as
    // their vehicleClass.
    .filter((r): r is typeof r & { vehicleClass: string; name: string } =>
      !!r.isActive && !!r.vehicleClass && !!r.name && r.passengers != null)
    .map((r) => ({ value: r.vehicleClass, label: r.name }));

  return { vehicleClasses, isLoading };
}
