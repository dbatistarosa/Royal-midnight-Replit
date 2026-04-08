import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { AdminStats, Booking, GetRecentBookingsParams, RevenuePeriod, RevenueByClass } from "./generated/api.schemas";

export interface FullRevenueStats {
  daily: RevenuePeriod[];
  byVehicleClass: RevenueByClass[];
  totalRevenue: number;
  totalCommissionPaid: number;
  totalCompanyRevenue: number;
  commissionPct: number;
  completedRides: number;
}

export function useGetAdminStats<TError = unknown>(
  options?: UseQueryOptions<AdminStats, TError>
): UseQueryResult<AdminStats, TError> {
  return useQuery<AdminStats, TError>({
    queryKey: ["adminStats"],
    queryFn: () => customFetch<AdminStats>("/api/admin/stats"),
    ...options,
  });
}

export function useGetRecentBookings<TError = unknown>(
  params?: GetRecentBookingsParams,
  options?: UseQueryOptions<Booking[], TError>
): UseQueryResult<Booking[], TError> {
  const qs = params?.limit != null ? `?limit=${params.limit}` : "";
  return useQuery<Booking[], TError>({
    queryKey: ["recentBookings", params],
    queryFn: () => customFetch<Booking[]>(`/api/admin/recent-bookings${qs}`),
    ...options,
  });
}

export function useGetRevenueStats<TError = unknown>(
  options?: { query?: UseQueryOptions<FullRevenueStats, TError> }
): UseQueryResult<FullRevenueStats, TError> {
  return useQuery<FullRevenueStats, TError>({
    queryKey: ["revenueStats"],
    queryFn: () => customFetch<FullRevenueStats>("/api/admin/revenue"),
    ...(options?.query ?? {}),
  });
}
