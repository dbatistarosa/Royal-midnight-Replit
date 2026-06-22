import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { timingSafeEqual } from "node:crypto";

// Auto-injected by the Supabase Edge Function runtime — no manual secret needed.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Manually configured secret: the "whsec_..." value from the Sent.dm webhook's settings page.
const SIGNING_SECRET = Deno.env.get("SENT_DM_WEBHOOK_SIGNING_SECRET");

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Sent.dm signs webhooks the same way as Svix/Stripe: HMAC-SHA256 over
 * `{webhookId}.{timestamp}.{rawBody}`, keyed by the base64 bytes after the
 * `whsec_` prefix. Signature header format: "v1,{base64sig} v1,{base64sig2}..."
 * (space-separated, supports secret rotation — any match is valid).
 */
async function isValidSignature(
  rawBody: string,
  webhookId: string,
  timestamp: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const keyBytes = base64ToBytes(secret.replace(/^whsec_/, ""));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signedContent = `${webhookId}.${timestamp}.${rawBody}`;
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const computed = bytesToBase64(new Uint8Array(sigBuffer));
  const computedBuf = Buffer.from(computed);

  return signatureHeader
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter((sig): sig is string => !!sig)
    .some((sig) => {
      const sigBuf = Buffer.from(sig);
      if (sigBuf.length !== computedBuf.length) return false;
      return timingSafeEqual(sigBuf, computedBuf);
    });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!SIGNING_SECRET) {
    console.error("[sent-dm-webhook] SENT_DM_WEBHOOK_SIGNING_SECRET not configured");
    return new Response("Not configured", { status: 500 });
  }

  const webhookId = req.headers.get("x-webhook-id");
  const timestamp = req.headers.get("x-webhook-timestamp");
  const signature = req.headers.get("x-webhook-signature");
  const rawBody = await req.text();

  if (!webhookId || !timestamp || !signature) {
    return new Response("Missing signature headers", { status: 400 });
  }

  const valid = await isValidSignature(rawBody, webhookId, timestamp, signature, SIGNING_SECRET);
  if (!valid) {
    console.error("[sent-dm-webhook] signature verification failed");
    return new Response("Invalid signature", { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const eventType = event.sub_type ?? event.event ?? event.field ?? "unknown";
  const payload = event.payload ?? {};

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.from("message_events").insert({
    event_type: eventType,
    message_id: payload.message_id ?? null,
    channel: payload.channel ?? null,
    to_phone: payload.to ?? payload.outbound_number ?? null,
    from_phone: payload.from ?? payload.inbound_number ?? null,
    message_status: payload.message_status ?? null,
    raw_payload: event,
  });

  if (error) {
    console.error("[sent-dm-webhook] failed to store event:", error.message);
    // Still ack 200 — Sent.dm shouldn't retry just because our DB write failed transiently.
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
