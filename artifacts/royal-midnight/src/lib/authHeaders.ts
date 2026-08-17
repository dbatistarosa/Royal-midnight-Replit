/**
 * Headers for an authenticated API call.
 *
 * The bearer token is memory-only by design (CN-014 moved the session into an
 * HttpOnly cookie), so after any page reload `token` is null even though the
 * user is still perfectly signed in. The cookie is what actually authenticates,
 * the API is same-origin, and fetch sends same-origin cookies by default — so a
 * missing token is normal, not a reason to skip the request.
 *
 * This exists because that fact was not applied consistently: a dozen screens
 * guarded their data loads with `if (!driverRecord?.id || !token) return;` and
 * so rendered an empty, permanently-spinning dashboard after every refresh.
 * Signing out and back in "fixed" it, which is what made it look intermittent.
 *
 * The header is still sent when a token exists, for the React Native driver app
 * and for the tab that just logged in and has one in memory.
 */
export function authHeaders(
  token: string | null | undefined,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** As above, for the calls that send a JSON body. */
export function jsonAuthHeaders(token: string | null | undefined): Record<string, string> {
  return authHeaders(token, { "Content-Type": "application/json" });
}
