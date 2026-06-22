import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Auto-injected by the Supabase Edge Function runtime — no manual secret needed.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Manually configured secrets (separate from the Express app's own Vercel env vars,
// since this Edge Function runs in a different runtime/account scope).
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "Royal Midnight <noreply@royalmidnight.com>";

// Re-notify at most every 15 minutes while a trip continues to run over, so a
// customer isn't emailed every single minute of an ongoing overage.
const RENOTIFY_INTERVAL_MINUTES = 15;

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
