import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Auto-injected by the Supabase Edge Function runtime — no manual secret needed.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Manually configured secrets (separate from the Express app's own Vercel env vars,
// since this Edge Function runs in a different runtime/account scope).
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "Royal Midnight <noreply@royalmidnight.com>";

// Shared secret that gates this function (CN-008). Set with:
//   supabase secrets set FUNCTION_INVOKE_SECRET=<value> --project-ref <ref>
// Callers send it as `Authorization: Bearer <value>`.
const FUNCTION_INVOKE_SECRET = Deno.env.get("FUNCTION_INVOKE_SECRET");

// Re-notify at most every 15 minutes while a trip continues to run over, so a
// customer isn't emailed every single minute of an ongoing overage.
const RENOTIFY_INTERVAL_MINUTES = 15;

/**
 * Constant-time string comparison.
 *
 * Hashing first means the comparison always runs over two fixed-length 32-byte
 * digests, so neither the length nor the content of the supplied value leaks
 * through timing. Deno does expose crypto.subtle.timingSafeEqual, but it is a
 * non-standard extension — this keeps the function portable.
 */
async function secretMatches(supplied: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(supplied)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i]! ^ bv[i]!;
  return diff === 0;
}

interface OverdueBooking {
  id: number;
  passenger_name: string;
  passenger_email: string;
  charter_hours: number | null;
  hourly_rate: string | null;
  trip_started_at: string;
  overage_notified_at: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function sendOverageEmail(to: string, name: string, extraMinutes: number, extraCharge: number) {
  if (!RESEND_API_KEY) {
    console.error("[check-reservation-status] RESEND_API_KEY not configured — skipping email");
    return;
  }
  const html = `
    <div style="font-family:Inter,sans-serif;color:#111;padding:24px">
      <h2 style="color:#f59e0b;font-size:18px;margin:0 0 8px">⏱️ Your trip has run past its scheduled time</h2>
      <p>Hi ${name.split(" ")[0]}, your hourly service has continued ${extraMinutes} minute${extraMinutes === 1 ? "" : "s"} past the time included in your booking.</p>
      <p>Estimated extra charge so far: <strong>$${extraCharge.toFixed(2)}</strong></p>
      <p style="color:#888;font-size:12px;margin-top:16px">This will be added to your final invoice when the trip ends.</p>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [to],
      subject: "Royal Midnight — Trip time extended",
      html,
    }),
  });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  await supabase.from("email_logs").insert({
    to,
    subject: "Royal Midnight — Trip time extended",
    type: "trip_overage_alert",
    status: res.ok ? "sent" : "failed",
    error: res.ok ? null : await res.text().catch(() => "unknown error"),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Authorization ──────────────────────────────────────────────────────────
  // This must be the first thing that happens. Everything below runs with the
  // service_role key, which bypasses RLS entirely: it reads passenger names and
  // emails, writes extra_charge onto live bookings, and sends customers billing
  // emails from our domain. Supabase's own verify_jwt is not sufficient, because
  // the anon key is a valid JWT and the anon key is public by design (CN-008).
  //
  // Fail closed: with no secret configured the function refuses to run rather
  // than silently reverting to being world-invokable.
  // The secret can come from an Edge Function env var or from the settings
  // table. The settings row is what the pg_cron job that drives this function
  // every minute can actually read — cron.job.command is SQL, so it looks the
  // value up at call time instead of storing it literally.
  let expectedSecret = FUNCTION_INVOKE_SECRET ?? "";
  if (!expectedSecret) {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await admin
      .from("settings")
      .select("value")
      .eq("key", "edge_function_invoke_secret")
      .maybeSingle();
    expectedSecret = (data?.value as string | undefined) ?? "";
  }

  if (!expectedSecret) {
    console.error("[check-reservation-status] no invoke secret configured — refusing to run");
    return new Response(JSON.stringify({ success: false, error: "Not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!(await secretMatches(authHeader, `Bearer ${expectedSecret}`))) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id, passenger_name, passenger_email, charter_hours, hourly_rate, trip_started_at, overage_notified_at")
    .eq("status", "in_progress")
    .eq("charter_mode", "hourly")
    .not("trip_started_at", "is", null);

  if (error) {
    console.error("[check-reservation-status] query failed:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  let checked = 0;
  let overdue = 0;

  for (const booking of (bookings ?? []) as OverdueBooking[]) {
    checked++;
    const scheduledMinutes = (booking.charter_hours ?? 0) * 60;
    const elapsedMinutes = (now - new Date(booking.trip_started_at).getTime()) / 60_000;

    if (elapsedMinutes <= scheduledMinutes) continue;

    overdue++;
    const extraMinutes = elapsedMinutes - scheduledMinutes;
    const hourlyRate = parseFloat(booking.hourly_rate ?? "95") || 95;
    const extraCharge = round2(extraMinutes * (hourlyRate / 60));

    await supabase.from("bookings").update({ extra_charge: extraCharge }).eq("id", booking.id);

    const lastNotified = booking.overage_notified_at ? new Date(booking.overage_notified_at).getTime() : null;
    const shouldNotify = !lastNotified || (now - lastNotified) / 60_000 >= RENOTIFY_INTERVAL_MINUTES;

    if (shouldNotify) {
      await sendOverageEmail(booking.passenger_email, booking.passenger_name, Math.round(extraMinutes), extraCharge);
      await supabase.from("bookings").update({ overage_notified_at: new Date().toISOString() }).eq("id", booking.id);
    }
  }

  return new Response(JSON.stringify({ success: true, checked, overdue }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
