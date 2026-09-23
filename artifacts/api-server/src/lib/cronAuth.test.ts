import { describe, expect, it } from "vitest";
import { isLocalInsecureCronAllowed } from "./cronAuth.js";

describe("insecure cron guard", () => {
  it("allows the explicit flag only in local development", () => {
    expect(
      isLocalInsecureCronAllowed({
        ALLOW_INSECURE_CRON: "1",
        NODE_ENV: "development",
      }),
    ).toBe(true);
  });

  it.each([
    { NODE_ENV: "production" },
    { NODE_ENV: "development", VERCEL_ENV: "preview" },
    { NODE_ENV: "development", RAILWAY_ENVIRONMENT_NAME: "staging" },
    { NODE_ENV: "development", CI: "true" },
    { NODE_ENV: "development", ALLOW_INSECURE_CRON: "0" },
  ])("rejects deployment or non-explicit environment %#", (env) => {
    expect(
      isLocalInsecureCronAllowed({ ALLOW_INSECURE_CRON: "1", ...env }),
    ).toBe(false);
  });
});
