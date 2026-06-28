import * as Sentry from "@sentry/node";

function isSentryConfigured(): boolean {
  return !!process.env.SENTRY_DSN;
}

export function getSentryStatus() {
  return { configured: isSentryConfigured() };
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
