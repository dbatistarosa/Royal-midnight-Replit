import Constants from "expo-constants";
import { useAuthStore } from "@/auth/store";

let baseUrl = "https://www.royalmidnight.com/api";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly data?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export type UploadUrlRequest = { name: string; size: number; contentType: string };
export type UploadUrlResponse = { uploadURL: string; objectPath: string };

export function configureApiClient(): void {
  const configured = Constants.expoConfig?.extra?.["apiBaseUrl"];
  if (typeof configured === "string" && configured.trim()) baseUrl = configured.replace(/\/$/, "");
}

function urlFor(path: string): string {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function customFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  // The API only returns the bearer token to the registered native client.
  // Keep this value aligned with login() in driverApi.ts; setting a different
  // value here silently turns a successful mobile login into a cookie-only
  // response that React Native cannot persist or use for its next request.
  headers.set("X-RM-Client", "driver-app");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = useAuthStore.getState().token;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(urlFor(path), { ...init, headers });
  const text = await response.text();
  let data: unknown = undefined;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!response.ok) {
    const record = data && typeof data === "object" ? data as Record<string, unknown> : undefined;
    const message = typeof record?.error === "string"
      ? record.error
      : typeof record?.message === "string"
        ? record.message
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, message, data);
  }
  return data as T;
}
