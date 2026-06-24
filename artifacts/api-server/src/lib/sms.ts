/**
 * Sent.dm SMS/WhatsApp library — calls the `send-message-via-sent` Supabase Edge
 * Function (graceful no-op when Supabase env vars are not set).
 * Configure via: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * (The Edge Function itself needs SENT_DM_API_KEY + SENT_DM_TEXT_TEMPLATE_NAME
 * set as Supabase Edge Function secrets — see supabase/functions/send-message-via-sent.)
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SmsChannel = "auto" | "sms" | "whatsapp";

export function isSmsConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

export function getSmsStatus() {
  return {
    configured: isSmsConfigured(),
    provider: isSmsConfigured() ? "sent.dm" : "none",
  };
}

/**
 * Normalise a phone number to E.164 format. Assumes US (+1) if no country code.
 * Returns null if the number is too short to be valid.
 */
function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return null;
}

async function sendSms(
  to: string | null | undefined,
  body: string,
  channel: SmsChannel = "auto",
): Promise<void> {
  const normalised = normalisePhone(to);
  if (!normalised) return; // no phone on file — silent skip

  if (!isSmsConfigured()) {
    console.log(`[sms] Sent.dm not configured — would send to ${normalised}: ${body.slice(0, 80)}…`);
    return;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-message-via-sent`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone: normalised, message: body, channel }),
    });
    const json = await res.json().catch(() => null) as { success?: boolean; error?: string; channel_used?: string } | null;
    if (!res.ok || !json?.success) {
      console.error(`[sms] Failed to send to ${normalised}:`, json?.error ?? res.status);
      return;
    }
    console.log(`[sms] Sent to ${normalised} via ${json.channel_used}`);
  } catch (err: any) {
    console.error(`[sms] Failed to send to ${normalised}:`, err.message);
  }
}

// ─── Message templates ────────────────────────────────────────────────────────

export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  await sendSms(phone,
    `Your Royal Midnight verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`
  );
}

export async function sendBookingConfirmationSms(
  phone: string | null | undefined,
  bookingRef: string,
  pickupAt: string,
  pickupAddress: string,
): Promise<void> {
  const dt = new Date(pickupAt).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  await sendSms(phone,
    `Royal Midnight: Booking ${bookingRef} confirmed. Pickup ${dt} at ${pickupAddress.split(",")[0]}. Track your ride at royalmidnight.com`
  );
}

export async function sendChauffeurIntroSms(
  phone: string | null | undefined,
  driverName: string,
  bookingRef: string,
  pickupAt: string,
): Promise<void> {
  const dt = new Date(pickupAt).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
  await sendSms(phone,
    `Royal Midnight: Your chauffeur ${driverName} will be with you at ${dt} for booking ${bookingRef}. Questions? Call 728-230-4531.`
  );
}

export async function sendDriverOnWaySms(
  phone: string | null | undefined,
  driverName: string,
  vehicleDesc: string,
): Promise<void> {
  await sendSms(phone,
    `Royal Midnight: ${driverName} is en route to your pickup in a ${vehicleDesc}. Track your ride at royalmidnight.com`
  );
}

export async function sendDriverArrivedSms(
  phone: string | null | undefined,
  driverName: string,
): Promise<void> {
  await sendSms(phone,
    `Royal Midnight: ${driverName} has arrived at your pickup location. Your chauffeur is waiting.`
  );
}

export async function sendCancellationSms(
  phone: string | null | undefined,
  bookingRef: string,
): Promise<void> {
  await sendSms(phone,
    `Royal Midnight: Booking ${bookingRef} has been cancelled. For assistance call 728-230-4531.`
  );
}
