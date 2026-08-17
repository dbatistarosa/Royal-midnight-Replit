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
  /** Gratuities collected and passed to chauffeurs in full. Reported alongside
   *  the calculation, not inside it — they are in neither gross nor net. */
  totalTips?: number;
  /** Add-ons flagged paid_to_driver, paid to the chauffeur with no commission. */
  totalDriverExtras?: number;
  /** Bookings in range with no recorded tax/fee breakdown, whose figures are
   *  estimated from the current rates. */
  estimatedRows?: number;
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
  options?: { query?: Partial<UseQueryOptions<FullRevenueStats, TError>> }
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
