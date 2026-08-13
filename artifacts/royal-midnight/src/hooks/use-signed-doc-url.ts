import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/constants";
import { useAuth } from "@/contexts/auth";

/**
 * Private driver documents (licence, insurance, registration) are no longer
 * served on an open URL. The download route accepts either a session header or
 * a short-lived signature — and browsers never send headers for <img src> or
 * <a href>, so the path has to be signed first (CN-003).
 */

/** Reduce anything the API might hand us to a bare object key.
 *
 *  A stored fileUrl is driver-supplied, so an absolute URL to an attacker host
 *  must never be echoed into an <img>/<a> — that would leak the admin's IP and
 *  user agent, or present a phishing link that reads as an internal document
 *  (CN-041). Only the key within our own object storage is kept. */
function toObjectKey(objectPath: string): string | null {
  const key = objectPath
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "")
    .replace(/^api\/storage\/objects\//, "")
    .replace(/^storage\/objects\//, "")
    .replace(/^objects\//, "");

  if (!key || key.includes("..")) return null;
  return key;
}

/** Exchange an object path for a signed, time-limited download URL. */
export async function fetchSignedDocUrl(
  objectPath: string | null | undefined,
  token: string | null,
): Promise<string | null> {
  if (!objectPath) return null;

  const key = toObjectKey(objectPath);
  if (!key) return null;

  try {
    const res = await fetch(`${API_BASE}/storage/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ objectPath: key }),
    });
    if (!res.ok) return null;
    const { path } = (await res.json()) as { path?: string };
    return path ? `${API_BASE}${path}` : null;
  } catch {
    return null;
  }
}

export interface SignedDocUrl {
  url: string | null;
  loading: boolean;
}

/** Resolve a private object path to a viewable URL. Returns `null` until the
 *  signature comes back, so callers should render a loading state. */
export function useSignedDocUrl(objectPath: string | null | undefined): SignedDocUrl {
  const { token } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!objectPath) {
      setUrl(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setUrl(null);

    fetchSignedDocUrl(objectPath, token).then(signed => {
      if (cancelled) return;
      setUrl(signed);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [objectPath, token]);

  return { url, loading };
}
