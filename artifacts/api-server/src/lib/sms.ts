/**
 * SMS is intentionally DISABLED (2026-07-15, owner decision: Resend email only).
 *
 * This used to call Sent.dm through the `send-message-via-sent` Supabase Edge
 * Function. When SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY were later added to
 * Vercel for object storage, isSmsConfigured() started returning true and every
 * booking event fired a doomed call to an Edge Function that has no Sent.dm API
 * key — so the whole surface is now an explicit no-op stub instead.
 *
 * To re-enable SMS someday: restore this file from git history (any commit at or
 * before ae3d7d5), redeploy the send-message-via-sent Edge Function, and set
 * SENT_DM_API_KEY + SENT_DM_TEXT_TEMPLATE_NAME as Supabase function secrets.
 * All call sites (auth OTP, booking confirmations, driver on-way/arrived,
 * cancellations, chauffeur intro) are still wired and will just work.
 */

export function isSmsConfigured(): boolean {
  return false;
}

export function getSmsStatus() {
  return { configured: false, provider: "none (SMS disabled — email only)" };
}

export async function sendOtpSms(_phone: string, _otp: string): Promise<void> {}

export async function sendBookingConfirmationSms(
  _phone: string | null | undefined,
  _bookingRef: string,
  _pickupAt: string,
  _pickupAddress: string,
): Promise<void> {}

export async function sendChauffeurIntroSms(
  _phone: string | null | undefined,
  _driverName: string,
  _bookingRef: string,
  _pickupAt: string,
): Promise<void> {}

export async function sendDriverOnWaySms(
  _phone: string | null | undefined,
  _driverName: string,
  _vehicleDesc: string,
): Promise<void> {}

export async function sendDriverArrivedSms(
  _phone: string | null | undefined,
  _driverName: string,
): Promise<void> {}

export async function sendCancellationSms(
  _phone: string | null | undefined,
  _bookingRef: string,
): Promise<void> {}
