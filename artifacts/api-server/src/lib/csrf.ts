const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type HeaderValue = string | string[] | undefined;

function firstHeaderValue(value: HeaderValue): string | null {
  const result = (Array.isArray(value) ? value[0] : value)?.trim();
  return result ? result : null;
}

function originFromReferer(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function normalizeOrigin(value: string | null): string | null {
  if (!value || value === "null") return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isTrustedCookieMutationOrigin(input: {
  method: string;
  sessionCookie?: string | null;
  origin?: HeaderValue;
  referer?: HeaderValue;
  allowedOrigins: ReadonlySet<string>;
  isAllowedPreviewOrigin?: (origin: string) => boolean;
}): boolean {
  if (!UNSAFE_METHODS.has(input.method.toUpperCase()) || !input.sessionCookie) {
    return true;
  }

  const rawOrigin = firstHeaderValue(input.origin);
  // If the browser supplied Origin, do not fall back to Referer: an invalid or
  // null Origin must fail closed rather than be bypassed by another header.
  const requestOrigin = rawOrigin
    ? normalizeOrigin(rawOrigin)
    : originFromReferer(firstHeaderValue(input.referer));
  if (!requestOrigin) return false;

  return (
    input.allowedOrigins.has(requestOrigin) ||
    Boolean(input.isAllowedPreviewOrigin?.(requestOrigin))
  );
}
