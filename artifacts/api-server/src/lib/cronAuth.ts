/**
 * The insecure cron escape hatch is intentionally limited to an unmistakable
 * local development process. A secret or deployment platform must never be
 * able to turn production cron authentication off.
 */
export function isLocalInsecureCronAllowed(
  env: Partial<Pick<
    NodeJS.ProcessEnv,
    "ALLOW_INSECURE_CRON" | "NODE_ENV" | "VERCEL_ENV" | "RAILWAY_ENVIRONMENT_NAME" | "CI"
  >>,
): boolean {
  return (
    env.ALLOW_INSECURE_CRON === "1" &&
    env.NODE_ENV === "development" &&
    !env.VERCEL_ENV &&
    !env.RAILWAY_ENVIRONMENT_NAME &&
    !env.CI
  );
}
