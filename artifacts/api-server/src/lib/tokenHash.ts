import crypto from "node:crypto";

/** Reset/setup links are bearer credentials; never persist the raw value. */
export function hashOneTimeToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}
