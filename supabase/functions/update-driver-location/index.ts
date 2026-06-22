import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Auto-injected by the Supabase Edge Function runtime — no manual secret needed.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Mirrors LIVE_TRACKING_STATUSES in artifacts/api-server/src/routes/drivers.ts —
// keep both in sync if trip status names change.
const LIVE_TRACKING_STATUSES = ["on_way", "on_location", "in_progress"];

interface UpdateLocationRequest {
  driver_id: number;
  latitude: number;
  longitude: number;
  booking_id?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: UpdateLocationRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { driver_id, latitude, longitude } = body;
  if (
    !driver_id ||
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
  ) {
    return new Response(
      JSON.stringify({ success: false, error: "driver_id, latitude, longitude are required and must be valid coordinates" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let bookingId = body.booking_id ?? null;
  if (!bookingId) {
    const { data: liveBooking } = await supabase
      .from("bookings")
      .select("id")
      .eq("driver_id", driver_id)
      .in("status", LIVE_TRACKING_STATUSES)
      .limit(1)
      .maybeSingle();
    bookingId = liveBooking?.id ?? null;
  }

  // History row — Realtime (enabled via the supabase_realtime publication)
  // broadcasts this insert to any subscribed map client automatically.
  const { error: insertError } = await supabase.from("driver_locations").insert({
    driver_id,
    booking_id: bookingId,
    latitude,
    longitude,
  });

  if (insertError) {
    console.error("[update-driver-location] insert failed:", insertError.message);
    return new Response(JSON.stringify({ success: false, error: insertError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Keep the "current location" snapshot on drivers in sync too.
  await supabase
    .from("drivers")
    .update({ latitude, longitude, location_updated_at: new Date().toISOString() })
    .eq("id", driver_id);

  return new Response(JSON.stringify({ success: true, booking_id: bookingId }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
