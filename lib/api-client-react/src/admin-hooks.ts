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
  // Extended financial breakdown
  totalGrossIncome?: number;
  totalTaxesCollected?: number;
  totalFeesCollected?: number;
  totalDriverCommissions?: number;
  companyNetIncome?: number;
  taxRatePct?: number;
  ccFeePct?: number;
}

export interface RevenueStatsParams {
  startDate?: string; // ISO date string
  endDate?: string;   // ISO date string
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
  params?: RevenueStatsParams,
  options?: { query?: UseQueryOptions<FullRevenueStats, TError> }
): UseQueryResult<FullRevenueStats, TError> {
  const qs = new URLSearchParams();
  if (params?.startDate) qs.set("startDate", params.startDate);
  if (params?.endDate) qs.set("endDate", params.endDate);
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return useQuery<FullRevenueStats, TError>({
    queryKey: ["revenueStats", params],
    queryFn: () => customFetch<FullRevenueStats>(`/api/admin/revenue${query}`),
    ...(options?.query ?? {}),
  });
}
