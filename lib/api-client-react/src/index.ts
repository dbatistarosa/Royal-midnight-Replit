export * from "./generated/api";
export * from "./generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
export { useGetAdminStats, useGetRecentBookings, useGetRevenueStats } from "./admin-hooks";
export type { FullRevenueStats } from "./admin-hooks";
