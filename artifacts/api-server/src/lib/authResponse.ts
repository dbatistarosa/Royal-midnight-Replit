/**
 * Browser sessions are authenticated with the HttpOnly cookie. Native clients
 * cannot rely on a browser cookie jar, so they must opt in explicitly when
 * they need the bearer token in an authentication response.
 */
export const NATIVE_CLIENT_HEADER = "x-rm-client";
export const DRIVER_APP_CLIENT = "driver-app";

function firstHeaderValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value ?? "").trim().toLowerCase();
}

export function isNativeClient(value: string | string[] | undefined): boolean {
  return firstHeaderValue(value) === DRIVER_APP_CLIENT;
}

export function withNativeToken<T extends Record<string, unknown>>(
  response: T,
  token: string,
  clientHeader: string | string[] | undefined,
): T | (T & { token: string }) {
  return isNativeClient(clientHeader) ? { ...response, token } : response;
}
