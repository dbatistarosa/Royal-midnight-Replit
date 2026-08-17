/**
 * Turn a failed API response into an Error carrying the server's own message.
 *
 * A number of admin and chauffeur actions were written as
 *
 *     await fetch(url, { method: "DELETE", headers });
 *     refetchTheList();
 *
 * with the response discarded. When the call failed — 403, a foreign-key
 * conflict, a column missing because a migration had not run — the spinner
 * stopped, the list reloaded unchanged, and the operator was left to work out
 * from a row that had not disappeared that the delete had not happened. The
 * server always says why; this makes sure somebody hears it.
 */
export async function assertOk(res: Response, fallback = "Request failed"): Promise<Response> {
  if (res.ok) return res;
  const body = await res.json().catch(() => null) as { error?: string } | null;
  throw new Error(body?.error || `${fallback} (HTTP ${res.status}).`);
}
