import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SENT_DM_API_KEY = Deno.env.get("SENT_DM_API_KEY");
const SENT_DM_TEXT_TEMPLATE_NAME = Deno.env.get("SENT_DM_TEXT_TEMPLATE_NAME");

type Channel = "auto" | "sms" | "whatsapp";

interface SendRequest {
  phone: string;
  message: string;
  channel?: Channel;
}

/** Normalise to E.164. Assumes US (+1) if no country code. Returns null if too short. */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!SENT_DM_API_KEY || !SENT_DM_TEXT_TEMPLATE_NAME) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "SENT_DM_API_KEY or SENT_DM_TEXT_TEMPLATE_NAME not configured as Edge Function secrets",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: SendRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { phone, message, channel = "auto" } = body;
  const normalized = phone ? normalizePhone(phone) : null;
  if (!normalized || !message) {
    return new Response(
      JSON.stringify({ success: false, error: "phone and message are required; phone must be a valid number" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Sent.dm's v3 API is template-based: every send references a pre-created
  // template by name, with variables filled in via `parameters`. There is no
  // raw freeform-text endpoint. SENT_DM_TEXT_TEMPLATE_NAME must point at a
  // template (created in the Sent.dm dashboard) with exactly one variable
  // named `body`, so this function can forward arbitrary message text.
  const payload: Record<string, unknown> = {
    to: [normalized],
    template: { name: SENT_DM_TEXT_TEMPLATE_NAME, parameters: { body: message } },
  };
  if (channel !== "auto") payload.channel = [channel];

  const sentRes = await fetch("https://api.sent.dm/v3/messages", {
    method: "POST",
    headers: {
      "x-api-key": SENT_DM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const sentJson = await sentRes.json().catch(() => null);

  if (!sentRes.ok || !sentJson?.success) {
    console.error("[send-message-via-sent] Sent.dm error:", sentRes.status, JSON.stringify(sentJson));
    return new Response(
      JSON.stringify({ success: false, error: sentJson?.error ?? `Sent.dm responded ${sentRes.status}` }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const recipient = sentJson.data?.recipients?.[0];
  return new Response(
    JSON.stringify({
      success: true,
      message_id: recipient?.message_id ?? null,
      channel_used: recipient?.channel ?? null,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
