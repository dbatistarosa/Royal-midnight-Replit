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
 * This function NOTIFIES. It does not price.
 *
 * It used to compute `extraMinutes * (hourlyRate / 60)` — a pro-rata meter —
 * and write the result straight onto `bookings.extra_charge` every minute a
 * charter ran long. The operator's published rule is the opposite: past a
 * 20-minute allowance the next WHOLE hour is charged, used or not. Worse, the
 * completion handler preferred any pre-existing extra_charge over its own
 * correct figure, so this estimate always won: a charter 26 minutes over was
 * billed $32.16 where the customer's own receipt said the rule was $75.00.
 *
 * The number below is now only ever shown in a warning email, and it uses the
 * real rule so the email and the final invoice agree. `extra_charge` is written
 * in exactly one place — POST /bookings/:id/trip/complete — which is also the
 * only place that can charge the card.
 *
 * Keep in step with artifacts/api-server/src/lib/hourlyOverage.ts. Two runtimes,
 * no shared module; the test suite for the rule lives with that file.
 */
const OVERAGE_GRACE_MINUTES = 20;

function billableOverageHours(overtimeMinutes: number): number {
  if (overtimeMinutes <= OVERAGE_GRACE_MINUTES) return 0;
  return Math.ceil(overtimeMinutes / 60);
}

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

/**
 * passenger_name is set by whoever creates the booking, and POST /bookings
 * accepts anonymous callers — so a name like `<a href="https://evil.example">
 * Click here</a>` would render as a live link inside an email sent from the
 * royalmidnight.com domain, spending its sending reputation on someone else's
 * phishing. api-server/src/lib/mailer.ts escapes all 81 of its interpolations;
 * this function was written separately and skipped the pattern.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendOverageEmail(to: string, name: string, extraMinutes: number, extraCharge: number) {
  if (!RESEND_API_KEY) {
    console.error("[check-reservation-status] RESEND_API_KEY not configured — skipping email");
    return;
  }
  const html = `
    <div style="font-family:Inter,sans-serif;color:#111;padding:24px">
      <h2 style="color:#f59e0b;font-size:18px;margin:0 0 8px">⏱️ Your trip has run past its scheduled time</h2>
      <p>Hi ${escapeHtml(String(name ?? "").split(" ")[0] ?? "")}, your hourly service has continued ${extraMinutes} minute${extraMinutes === 1 ? "" : "s"} past the time included in your booking.</p>
      <p>Additional time so far: <strong>$${extraCharge.toFixed(2)}</strong></p>
      <p style="color:#888;font-size:12px;margin-top:16px">
        Past the first ${OVERAGE_GRACE_MINUTES} minutes, additional time is charged by the whole hour.
        Tax and card processing are added to this amount, and it is charged to the card on file when the trip ends.
      </p>
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
    const billedHours = billableOverageHours(extraMinutes);
    const extraCharge = round2(billedHours * hourlyRate);

    // Deliberately no write to bookings.extra_charge — see the note above.

    // Inside the free allowance there is nothing to warn about yet.
    if (billedHours === 0) continue;

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
