/**
 * Twilio SMS library — graceful no-op when TWILIO_* env vars are not set.
 * Configure via: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 */

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER;

export function isSmsConfigured(): boolean {
  return !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);
}

export function getSmsStatus() {
  return {
    configured: isSmsConfigured(),
    provider: isSmsConfigured() ? "twilio" : "none",
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

async function sendSms(to: string | null | undefined, body: string): Promise<void> {
  const normalised = normalisePhone(to);
  if (!normalised) return; // no phone on file — silent skip

  if (!isSmsConfigured()) {
    console.log(`[sms] Twilio not configured — would send to ${normalised}: ${body.slice(0, 80)}…`);
    return;
  }

  // Dynamic import so the module can be imported even without the package installed
  try {
    const twilio = (await import("twilio")).default;
    const client = twilio(TWILIO_SID!, TWILIO_TOKEN!);
    await client.messages.create({ to: normalised, from: TWILIO_FROM!, body });
    console.log(`[sms] Sent to ${normalised}`);
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
