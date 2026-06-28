import * as Sentry from "@sentry/react";

function getDsn(): string | undefined {
  return import.meta.env["VITE_SENTRY_DSN"] as string | undefined;
}

/** No-ops when VITE_SENTRY_DSN is unset, same pattern as VITE_MAPBOX_TOKEN
 *  elsewhere in this app. Must run before the app is rendered. */
export function initSentry() {
  const dsn = getDsn();
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}

export { Sentry };
