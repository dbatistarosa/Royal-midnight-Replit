import * as Sentry from "@sentry/node";

function isSentryConfigured(): boolean {
  return !!process.env.SENTRY_DSN;
}

export function getSentryStatus() {
  return { configured: isSentryConfigured() };
}

/** Best-effort alert for auth/authz events worth someone seeing in real time
 *  (CN-015) — previously these only ever reached stdout. Callers must reach
 *  this via a dynamic `import()`, not a static one: see app.ts's comment on
 *  why a static top-level import of this module outside the guarded loader
 *  is what took the whole API down once already. */
export function captureSecurityEvent(message: string, extra: Record<string, unknown>): void {
  if (!isSentryConfigured()) return;
  try {
    Sentry.captureMessage(message, { level: "warning", extra });
  } catch {
    // Never let alerting affect the request it's reporting on.
  }
}

/** No-ops when SENTRY_DSN is unset — mirrors mailer.ts/sms.ts's pattern of
 *  graceful degradation when an optional third-party integration isn't
 *  configured yet. Must run before the app/middleware are built. */
export function initSentry() {
  if (!isSentryConfigured()) {
    console.log("[sentry] SENTRY_DSN not set — error monitoring disabled");
    return;
  }
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
  });
}

export { Sentry };
