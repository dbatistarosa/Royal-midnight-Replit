export * from "./generated/api";
export * from "./generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter, customFetch, ApiError, ResponseParseError } from "./custom-fetch";
export type { AuthTokenGetter, CustomFetchOptions } from "./custom-fetch";
export {
  useGetAdminStats,
  useGetRecentBookings,
  useGetRevenueStats,
} from "./admin-hooks";
export type { FullRevenueStats, RevenueStatsParams } from "./admin-hooks";
