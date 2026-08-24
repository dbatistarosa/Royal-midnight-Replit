import nodemailer from "nodemailer";
import { Resend } from "resend";
import { db } from "@workspace/db";
import { emailLogsTable } from "@workspace/db/schema";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? "587");
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM ?? "Royal Midnight <noreply@royalmidnight.com>";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@royalmidnight.com";

function isSmtpConfigured() {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function isResendConfigured() {
  return !!RESEND_API_KEY;
}

export function getMailerStatus() {
  if (isResendConfigured()) return { configured: true, provider: "resend" as const };
  if (isSmtpConfigured()) return { configured: true, provider: "smtp" as const };
  return { configured: false, provider: "none" as const };
}

function createSmtpTransport() {
  if (!isSmtpConfigured()) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function logEmail(to: string | string[], subject: string, type: string, status: "sent" | "skipped" | "failed", error?: string) {
  try {
    const toStr = Array.isArray(to) ? to.join(", ") : to;
    await db.insert(emailLogsTable).values({ to: toStr, subject, type, status, error: error ?? null });
  } catch {}
}

async function send(to: string | string[], subject: string, html: string, type = "general") {
  const toArr = Array.isArray(to) ? to : [to];

  if (isResendConfigured()) {
    try {
      const resend = new Resend(RESEND_API_KEY);
      await resend.emails.send({
        from: SMTP_FROM,
        to: toArr,
        subject,
        html,
      });
      await logEmail(to, subject, type, "sent");
    } catch (err: any) {
      console.error("[mailer] Resend failed:", err.message);
      await logEmail(to, subject, type, "failed", err.message);
    }
    return;
  }

  if (isSmtpConfigured()) {
    const transport = createSmtpTransport();
    if (!transport) { await logEmail(to, subject, type, "skipped", "SMTP transport creation failed"); return; }
    try {
      await transport.sendMail({ from: SMTP_FROM, to, subject, html });
      await logEmail(to, subject, type, "sent");
    } catch (err: any) {
      console.error("[mailer] SMTP failed:", err.message);
      await logEmail(to, subject, type, "failed", err.message);
    }
    return;
  }

  console.log(`[mailer] No email provider configured — would send to ${Array.isArray(to) ? to.join(", ") : to}: ${subject}`);
  await logEmail(to, subject, type, "skipped", "No email provider configured (set RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS)");
}

// Royal Midnight email templates interpolate user-supplied strings (names, addresses,
// special requests, etc.) directly into raw HTML — escapeHtml() prevents stored XSS
// from rendering as live markup in a recipient's email client.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrap(body: string) {
  return `<!DOCTYPE html><html><body style="font-family:Georgia,serif;background:#050505;color:#e8e0d0;margin:0;padding:0">
<div style="max-width:600px;margin:0 auto;padding:32px 24px">
<div style="border-bottom:1px solid #c9a84c;padding-bottom:20px;margin-bottom:24px;text-align:center">
  <img src="https://royalmidnight.com/royal-midnight-logo-original.png" alt="Royal Midnight" style="height:90px;width:auto;display:inline-block;max-width:300px" />
</div>
${body}
<div style="border-top:1px solid #333;margin-top:32px;padding-top:16px;font-size:11px;color:#666;text-align:center">
  Royal Midnight Luxury Transportation &middot; South Florida
</div>
</div></body></html>`;
}

function row(label: string, value: string) {
  return `<tr><td style="padding:6px 0;color:#888;font-size:13px;width:140px;vertical-align:top">${label}</td><td style="padding:6px 0;font-size:13px;color:#e8e0d0">${value}</td></tr>`;
}

export type BookingEmailData = {
  id: number;
  passengerName: string;
  passengerEmail: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string;
  vehicleClass: string;
  passengers: number;
  priceQuoted: number;
  driverEarnings?: number;
  flightNumber?: string | null;
  specialRequests?: string | null;
  status?: string;
};

export async function sendBookingConfirmationPassenger(b: BookingEmailData) {
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const refNum = `RM-${String(b.id).padStart(4, "0")}`;
  const vehicleLabel = b.vehicleClass === "business" ? "Business Class Sedan" : b.vehicleClass === "suv" ? "Premium SUV" : b.vehicleClass;
  const dateStr = new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" });

  const html = wrap(`
<div style="text-align:center;margin-bottom:28px">
  <div style="display:inline-block;background:#c9a84c14;border:1px solid #c9a84c40;padding:16px 32px">
    <p style="color:#888;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin:0 0 6px">Payment Receipt</p>
    <p style="color:#c9a84c;font-size:28px;font-weight:bold;letter-spacing:4px;margin:0;font-family:monospace">${refNum}</p>
  </div>
</div>

<p style="color:#e8e0d0;font-size:14px;margin:0 0 4px">Dear ${escapeHtml(b.passengerName.split(" ")[0])},</p>
<p style="color:#888;font-size:13px;margin:0 0 24px;line-height:1.6">
  Your payment has been received and your reservation is confirmed. Below is your booking receipt — please keep it for your records.
</p>

<div style="background:#0d0d0d;border:1px solid #222;padding:20px;margin-bottom:20px">
  <p style="color:#c9a84c;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin:0 0 14px">Itinerary</p>
  <table style="width:100%;border-collapse:collapse">
    ${row("Date &amp; Time", dateStr)}
    ${row("Pick-up", escapeHtml(b.pickupAddress))}
    ${row("Drop-off", escapeHtml(b.dropoffAddress))}
    ${b.flightNumber ? row("Flight", escapeHtml(b.flightNumber)) : ""}
  </table>
</div>

<div style="background:#0d0d0d;border:1px solid #222;padding:20px;margin-bottom:20px">
  <p style="color:#c9a84c;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin:0 0 14px">Vehicle &amp; Passengers</p>
  <table style="width:100%;border-collapse:collapse">
    ${row("Vehicle", vehicleLabel)}
    ${row("Passengers", String(b.passengers))}
    ${b.specialRequests ? row("Special Requests", escapeHtml(b.specialRequests)) : ""}
  </table>
</div>

<div style="background:#0d0d0d;border:1px solid #c9a84c40;padding:20px;margin-bottom:24px">
  <p style="color:#c9a84c;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin:0 0 14px">Payment Summary</p>
  <table style="width:100%;border-collapse:collapse">
    <tr>
      <td style="padding:6px 0;color:#888;font-size:13px">Subtotal</td>
      <td style="padding:6px 0;font-size:13px;color:#e8e0d0;text-align:right">$${b.priceQuoted.toFixed(2)}</td>
    </tr>
    <tr style="border-top:1px solid #333">
      <td style="padding:10px 0 4px;color:#e8e0d0;font-size:15px;font-weight:bold">Total Charged</td>
      <td style="padding:10px 0 4px;font-size:15px;font-weight:bold;color:#c9a84c;text-align:right">$${b.priceQuoted.toFixed(2)}</td>
    </tr>
  </table>
</div>

<div style="text-align:center;margin-bottom:28px">
  <a href="${appUrl}/passenger/rides" style="display:inline-block;background:#c9a84c;color:#050505;padding:12px 32px;text-decoration:none;font-weight:bold;font-size:12px;letter-spacing:2px;text-transform:uppercase">VIEW MY BOOKING</a>
</div>

<p style="color:#666;font-size:12px;line-height:1.7;text-align:center">
  Your driver details will be sent closer to your pickup time.<br>
  Questions? Reply to this email or visit <a href="${appUrl}" style="color:#c9a84c">${appUrl.replace(/^https?:\/\//, "")}</a>
</p>`);

  await send(b.passengerEmail, `Payment Receipt — Royal Midnight ${refNum}`, html, "booking_confirmation_passenger");
}

export async function sendNewBookingAdmin(b: BookingEmailData) {
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const refNum = `RM-${String(b.id).padStart(4, "0")}`;
  const vehicleLabel = b.vehicleClass === "business" ? "Business Class Sedan" : b.vehicleClass === "suv" ? "Premium SUV" : b.vehicleClass;
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 4px">New Paid Booking — ${refNum}</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">A new reservation has been paid and is awaiting driver assignment.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking #", refNum)}
  ${row("Passenger", escapeHtml(b.passengerName))}
  ${row("Email", escapeHtml(b.passengerEmail))}
  ${row("Pickup", escapeHtml(b.pickupAddress))}
  ${row("Dropoff", escapeHtml(b.dropoffAddress))}
  ${row("Date &amp; Time", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
  ${row("Vehicle", vehicleLabel)}
  ${row("Passengers", String(b.passengers))}
  ${row("Total Fare", `<strong style="color:#c9a84c">$${b.priceQuoted.toFixed(2)}</strong>`)}
  ${b.flightNumber ? row("Flight", escapeHtml(b.flightNumber)) : ""}
  ${b.specialRequests ? row("Special Requests", escapeHtml(b.specialRequests)) : ""}
</table>
<p style="margin-top:24px"><a href="${appUrl}/admin/bookings" style="background:#c9a84c;color:#050505;padding:10px 24px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px">MANAGE IN ADMIN</a></p>`);
  await send(ADMIN_EMAIL, `New Booking ${refNum} — ${b.passengerName}`, html, "new_booking_admin");
}

export async function sendNewBookingAvailableToDrivers(b: BookingEmailData, driverEmails: string[]) {
  if (driverEmails.length === 0) return;
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const refNum = `RM-${String(b.id).padStart(4, "0")}`;
  const earnings = b.driverEarnings != null ? `$${b.driverEarnings.toFixed(2)}` : "—";
  const vehicleLabel = b.vehicleClass === "business" ? "Business Class Sedan" : b.vehicleClass === "suv" ? "Premium SUV" : b.vehicleClass;
  const dateStr = new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" });
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 4px">New Ride Available — ${refNum}</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">A confirmed booking is ready to accept. Log in to the driver portal to claim it before another driver does.</p>

<div style="background:#0d0d0d;border:1px solid #c9a84c40;padding:20px;margin-bottom:20px">
  <p style="color:#c9a84c;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin:0 0 14px">Your Earnings</p>
  <p style="color:#c9a84c;font-size:32px;font-weight:bold;margin:0;font-family:monospace">${earnings}</p>
</div>

<table style="width:100%;border-collapse:collapse">
  ${row("Date &amp; Time", dateStr)}
  ${row("Pick-up", escapeHtml(b.pickupAddress))}
  ${row("Drop-off", escapeHtml(b.dropoffAddress))}
  ${row("Vehicle", vehicleLabel)}
  ${row("Passengers", String(b.passengers))}
  ${b.flightNumber ? row("Flight", escapeHtml(b.flightNumber)) : ""}
  ${b.specialRequests ? row("Special Requests", escapeHtml(b.specialRequests)) : ""}
</table>
<p style="margin-top:24px"><a href="${appUrl}/driver/dashboard" style="background:#c9a84c;color:#050505;padding:12px 28px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px">ACCEPT THIS RIDE</a></p>
<p style="margin-top:16px;color:#666;font-size:11px">Log in to the driver portal to view full details and accept the ride.</p>`);
  await send(driverEmails, `New Ride ${refNum} — ${earnings} earnings`, html, "new_booking_drivers");
}

// Sent when an admin directly assigns a driver to a booking (not the open-pool
// self-accept flow) — the driver otherwise has no signal a trip exists for them.
export async function sendBookingAssignedDriver(b: BookingEmailData, driverEmail: string) {
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const refNum = `RM-${String(b.id).padStart(4, "0")}`;
  const earnings = b.driverEarnings != null ? `$${b.driverEarnings.toFixed(2)}` : "—";
  const vehicleLabel = b.vehicleClass === "business" ? "Business Class Sedan" : b.vehicleClass === "suv" ? "Premium SUV" : b.vehicleClass;
  const dateStr = new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" });
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 4px">New Trip Assigned — ${refNum}</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">An admin has assigned this trip directly to you.</p>

<div style="background:#0d0d0d;border:1px solid #c9a84c40;padding:20px;margin-bottom:20px">
  <p style="color:#c9a84c;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin:0 0 14px">Your Earnings</p>
  <p style="color:#c9a84c;font-size:32px;font-weight:bold;margin:0;font-family:monospace">${earnings}</p>
</div>

<table style="width:100%;border-collapse:collapse">
  ${row("Date &amp; Time", dateStr)}
  ${row("Pick-up", escapeHtml(b.pickupAddress))}
  ${row("Drop-off", escapeHtml(b.dropoffAddress))}
  ${row("Vehicle", vehicleLabel)}
  ${row("Passengers", String(b.passengers))}
  ${b.flightNumber ? row("Flight", escapeHtml(b.flightNumber)) : ""}
  ${b.specialRequests ? row("Special Requests", escapeHtml(b.specialRequests)) : ""}
</table>
<p style="margin-top:24px"><a href="${appUrl}/driver/dashboard" style="background:#c9a84c;color:#050505;padding:12px 28px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px">VIEW TRIP DETAILS</a></p>`);
  await send(driverEmail, `New Trip Assigned ${refNum} — ${earnings} earnings`, html, "booking_assigned_driver");
}

export async function sendBookingCancelledAdmin(b: BookingEmailData) {
  const html = wrap(`
<h2 style="color:#ef4444;font-size:20px;margin:0 0 20px">Booking #${b.id} Cancelled</h2>
<table style="width:100%;border-collapse:collapse">
  ${row("Passenger", escapeHtml(b.passengerName))}
  ${row("Email", escapeHtml(b.passengerEmail))}
  ${row("Pickup", escapeHtml(b.pickupAddress))}
  ${row("Dropoff", escapeHtml(b.dropoffAddress))}
  ${row("Was Scheduled", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York" }))}
  ${row("Total Fare", `$${b.priceQuoted.toFixed(2)}`)}
</table>`);
  await send(ADMIN_EMAIL, `Booking #${b.id} Cancelled — ${b.passengerName}`, html, "booking_cancelled_admin");
}

export async function sendDriverAcceptedPassenger(
  b: BookingEmailData,
  driverName: string,
  driverPhone: string,
  vehicleDescription: string,
) {
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const html = wrap(`
<h2 style="color:#22c55e;font-size:20px;margin:0 0 8px">Your Driver is Confirmed</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">Great news, ${escapeHtml(b.passengerName.split(" ")[0])}. A driver has been assigned to your reservation. Details are below.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking #", `RM-${String(b.id).padStart(4, "0")}`)}
  ${row("Driver", escapeHtml(driverName))}
  ${row("Phone", escapeHtml(driverPhone))}
  ${row("Vehicle", escapeHtml(vehicleDescription))}
  ${row("Pickup", escapeHtml(b.pickupAddress))}
  ${row("Dropoff", escapeHtml(b.dropoffAddress))}
  ${row("Date &amp; Time", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
  ${b.flightNumber ? row("Flight", escapeHtml(b.flightNumber)) : ""}
</table>
<p style="margin-top:24px"><a href="${appUrl}/passenger/rides" style="background:#c9a84c;color:#050505;padding:10px 24px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px">VIEW MY RIDES</a></p>
<p style="margin-top:20px;color:#888;font-size:12px">
  Please be ready at the pickup location at the scheduled time.<br>
  <strong style="color:#c9a84c">Royal Midnight Luxury Transportation</strong>
</p>`);
  await send(b.passengerEmail, `Your Driver is Confirmed — Royal Midnight #RM-${String(b.id).padStart(4, "0")}`, html, "driver_accepted_passenger");
}

export async function sendDriverAcceptedAdmin(b: BookingEmailData, driverName: string, driverEmail: string) {
  const html = wrap(`
<h2 style="color:#22c55e;font-size:20px;margin:0 0 20px">Driver Accepted Booking #${b.id}</h2>
<table style="width:100%;border-collapse:collapse">
  ${row("Driver", escapeHtml(driverName))}
  ${row("Driver Email", escapeHtml(driverEmail))}
  ${row("Passenger", escapeHtml(b.passengerName))}
  ${row("Pickup", escapeHtml(b.pickupAddress))}
  ${row("Dropoff", escapeHtml(b.dropoffAddress))}
  ${row("Scheduled", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York" }))}
  ${row("Driver Earnings", b.driverEarnings != null ? `$${b.driverEarnings.toFixed(2)}` : "—")}
</table>`);
  await send(ADMIN_EMAIL, `Driver Accepted — Booking #${b.id} (${driverName})`, html, "driver_accepted_admin");
}

export async function sendDriverUnassignedAdmin(bookingId: number, driverName: string, passengerName: string) {
  const html = wrap(`
<h2 style="color:#f59e0b;font-size:20px;margin:0 0 20px">Driver Unassigned from Booking #${bookingId}</h2>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking #", String(bookingId))}
  ${row("Passenger", escapeHtml(passengerName))}
  ${row("Unassigned Driver", escapeHtml(driverName))}
</table>
<p style="margin-top:16px;color:#888;font-size:13px">The booking is now back in the available pool for drivers to accept.</p>`);
  await send(ADMIN_EMAIL, `Driver Unassigned — Booking #${bookingId}`, html, "driver_unassigned_admin");
}

export async function sendInvoiceToPassenger(b: BookingEmailData, invoiceUrl: string, invoicePdfUrl: string | null) {
  const bookingRef = `RM-${String(b.id).padStart(4, "0")}`;
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 8px">Your Invoice is Ready</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">Please find your invoice for booking ${bookingRef} below. Payment is due within 7 days.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking #", bookingRef)}
  ${row("Passenger", escapeHtml(b.passengerName))}
  ${row("Pickup", escapeHtml(b.pickupAddress))}
  ${row("Dropoff", escapeHtml(b.dropoffAddress))}
  ${row("Date &amp; Time", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
  ${row("Vehicle", b.vehicleClass === "business" ? "Business Class Sedan" : "Premium SUV")}
  ${row("Total Due", `<span style="color:#c9a84c;font-weight:bold">$${b.priceQuoted.toFixed(2)}</span>`)}
</table>
<p style="margin-top:28px;text-align:center">
  <a href="${invoiceUrl}" style="background:#c9a84c;color:#050505;padding:12px 32px;text-decoration:none;font-weight:bold;font-size:14px;letter-spacing:1px;display:inline-block">PAY INVOICE</a>
</p>
${invoicePdfUrl ? `<p style="margin-top:16px;text-align:center"><a href="${invoicePdfUrl}" style="color:#c9a84c;font-size:12px;text-decoration:underline">Download PDF</a></p>` : ""}
<p style="margin-top:24px;color:#888;font-size:12px">
  Questions? Reply to this email or visit <a href="${appUrl}/contact" style="color:#c9a84c">${appUrl}/contact</a>.<br>
  <strong style="color:#c9a84c">Royal Midnight Luxury Transportation</strong>
</p>`);
  await send(b.passengerEmail, `Invoice for Booking ${bookingRef} — Royal Midnight`, html, "invoice_passenger");
}

export async function sendBookingCancelledPassenger(b: BookingEmailData, cancellationFee: number) {
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const bookingRef = `RM-${String(b.id).padStart(4, "0")}`;
  const refundAmount = Math.max(0, b.priceQuoted - cancellationFee);
  const html = wrap(`
<h2 style="color:#ef4444;font-size:20px;margin:0 0 8px">Booking Cancelled</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">Hi ${escapeHtml(b.passengerName.split(" ")[0])}, your reservation has been cancelled. Here is a summary.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking", bookingRef)}
  ${row("Route", `${escapeHtml(b.pickupAddress)} → ${escapeHtml(b.dropoffAddress)}`)}
  ${row("Was Scheduled", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
  ${row("Booking Total", `$${b.priceQuoted.toFixed(2)}`)}
  ${cancellationFee > 0 ? row("Cancellation Fee", `<span style="color:#ef4444">$${cancellationFee.toFixed(2)}</span>`) : row("Cancellation Fee", '<span style="color:#22c55e">None</span>')}
  ${refundAmount > 0 ? row("Refund Amount", `<span style="color:#22c55e;font-weight:bold">$${refundAmount.toFixed(2)}</span>`) : ""}
</table>
<p style="margin-top:20px;color:#888;font-size:12px">
  ${cancellationFee > 0 ? `A cancellation fee applies per our policy. A refund of $${refundAmount.toFixed(2)} will be processed within 5–10 business days.` : "No cancellation fee applies. If payment was collected, a full refund will be processed within 5–10 business days."}
</p>
<p style="margin-top:20px">
  <a href="${appUrl}/book" style="background:#c9a84c;color:#050505;padding:10px 24px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px">BOOK AGAIN</a>
</p>`);
  await send(b.passengerEmail, `Booking ${bookingRef} Cancelled — Royal Midnight`, html, "booking_cancelled_passenger");
}

export async function sendDriverOnWay(b: BookingEmailData) {
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const bookingRef = `RM-${String(b.id).padStart(4, "0")}`;
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 8px">Your Driver Is On the Way</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">Hi ${escapeHtml(b.passengerName.split(" ")[0])}, your Royal Midnight driver is heading to your pickup location now.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking", bookingRef)}
  ${row("Pickup", escapeHtml(b.pickupAddress))}
  ${row("Date &amp; Time", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
</table>
<p style="margin-top:20px;color:#888;font-size:12px">
  Please be ready at your pickup location. If you need to contact your driver, reply to this email or call our dispatch line.<br>
  <strong style="color:#c9a84c">Royal Midnight Luxury Transportation</strong>
</p>
<p style="margin-top:20px">
  <a href="${appUrl}/passenger/rides" style="background:#c9a84c;color:#050505;padding:10px 24px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px">VIEW MY BOOKING</a>
</p>`);
  await send(b.passengerEmail, `Your Driver Is On the Way — Royal Midnight ${bookingRef}`, html, "driver_on_way_passenger");
}

export async function sendDriverArrived(b: BookingEmailData) {
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const bookingRef = `RM-${String(b.id).padStart(4, "0")}`;
  const html = wrap(`
<h2 style="color:#22c55e;font-size:20px;margin:0 0 8px">Your Driver Has Arrived</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">Hi ${escapeHtml(b.passengerName.split(" ")[0])}, your Royal Midnight driver is at your pickup location.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking", bookingRef)}
  ${row("Pickup", escapeHtml(b.pickupAddress))}
  ${row("Date &amp; Time", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
</table>
<p style="margin-top:20px;color:#888;font-size:12px">
  Please proceed to your vehicle. If you need assistance locating your driver, reply to this email.<br>
  <strong style="color:#c9a84c">Royal Midnight Luxury Transportation</strong>
</p>
<p style="margin-top:20px">
  <a href="${appUrl}/passenger/rides" style="background:#c9a84c;color:#050505;padding:10px 24px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px">VIEW MY BOOKING</a>
</p>`);
  await send(b.passengerEmail, `Your Driver Has Arrived — Royal Midnight ${bookingRef}`, html, "driver_arrived_passenger");
}

export async function sendTripCompletionEmail(b: BookingEmailData, tipAmount?: number | null, extraCharge?: number | null) {
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const bookingRef = `RM-${String(b.id).padStart(4, "0")}`;
  const total = b.priceQuoted
    + (tipAmount != null && tipAmount > 0 ? tipAmount : 0)
    + (extraCharge != null && extraCharge > 0 ? extraCharge : 0);
  const html = wrap(`
<h2 style="color:#22c55e;font-size:20px;margin:0 0 8px">Trip Completed</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">Hi ${escapeHtml(b.passengerName.split(" ")[0])}, thank you for riding with Royal Midnight. We hope you enjoyed your journey.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking", bookingRef)}
  ${row("Route", `${escapeHtml(b.pickupAddress)} → ${escapeHtml(b.dropoffAddress)}`)}
  ${row("Date", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
  ${row("Vehicle", b.vehicleClass === "business" ? "Business Class Sedan" : b.vehicleClass === "suv" ? "Premium SUV" : b.vehicleClass)}
  ${row("Base Fare", `$${b.priceQuoted.toFixed(2)}`)}
  ${extraCharge != null && extraCharge > 0 ? row("Extra Time Charge", `<span style="color:#f59e0b">$${extraCharge.toFixed(2)}</span>`) : ""}
  ${tipAmount != null && tipAmount > 0 ? row("Gratuity", `<span style="color:#22c55e">$${tipAmount.toFixed(2)}</span>`) : ""}
  ${row("Total Charged", `<span style="color:#c9a84c;font-weight:bold">$${total.toFixed(2)}</span>`)}
</table>
<p style="margin-top:28px">
  <a href="${appUrl}/passenger/rides/${b.id}" style="background:#c9a84c;color:#050505;padding:10px 24px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px">RATE YOUR RIDE</a>
</p>
<p style="margin-top:20px;color:#888;font-size:12px">
  We value your feedback. Please take a moment to rate your driver.<br>
  <strong style="color:#c9a84c">Royal Midnight Luxury Transportation</strong>
</p>`);
  await send(b.passengerEmail, `Trip Completed — Royal Midnight ${bookingRef}`, html, "trip_completion_passenger");
}

export async function sendAccountInvitation({
  passengerName,
  passengerEmail,
  bookingId,
}: {
  passengerName: string;
  passengerEmail: string;
  bookingId: number;
}) {
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const bookingRef = `RM-${String(bookingId).padStart(4, "0")}`;
  const signupUrl = `${appUrl}/sign-up?email=${encodeURIComponent(passengerEmail)}`;
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 8px">Your Booking Is Ready</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">
  Hi ${escapeHtml(passengerName.split(" ")[0])}, a Royal Midnight reservation (${bookingRef}) has been created for you.
  Create your account to view your bookings, track your driver, and manage future reservations.
</p>
<p style="margin-top:24px">
  <a href="${signupUrl}" style="background:#c9a84c;color:#050505;padding:12px 28px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px">CREATE MY ACCOUNT</a>
</p>
<p style="margin-top:20px;color:#888;font-size:12px">
  Your email address (${escapeHtml(passengerEmail)}) is already linked to your booking — just create a password to get started.<br>
  <strong style="color:#c9a84c">Royal Midnight Luxury Transportation</strong>
</p>`);
  await send(passengerEmail, `Your Royal Midnight Reservation is Ready — Create Your Account`, html, "account_invitation");
}

export async function sendStatusChangedAdmin(bookingId: number, oldStatus: string, newStatus: string, passengerName: string) {
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 20px">Booking #${bookingId} Status Changed</h2>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking #", String(bookingId))}
  ${row("Passenger", escapeHtml(passengerName))}
  ${row("Previous Status", oldStatus.replace(/_/g, " "))}
  ${row("New Status", newStatus.replace(/_/g, " "))}
</table>`);
  await send(ADMIN_EMAIL, `Booking #${bookingId} → ${newStatus} (${passengerName})`, html, "status_changed_admin");
}

/**
 * Sent when an administrator edits a reservation that a passenger already has
 * in hand.
 *
 * Changing someone's pickup time or address without telling them is the kind of
 * silent edit that turns into a missed ride, so the admin edit screen offers
 * this and defaults it on. Only the fields that actually changed are listed —
 * a diff is far easier to act on than a re-sent copy of the whole booking, and
 * it makes clear that nothing else moved.
 */
export async function sendBookingUpdatedPassenger(
  b: BookingEmailData,
  changes: Array<{ label: string; from: string; to: string }>,
) {
  if (changes.length === 0) return;
  const refNum = `RM-${String(b.id).padStart(4, "0")}`;
  const dateStr = new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" });

  const changeRows = changes.map(c => `
    <tr>
      <td style="padding:8px 0;color:#888;font-size:13px;width:140px;vertical-align:top">${escapeHtml(c.label)}</td>
      <td style="padding:8px 0;font-size:13px;color:#e8e0d0">
        <span style="color:#777;text-decoration:line-through">${escapeHtml(c.from)}</span><br />
        <span style="color:#c9a84c">${escapeHtml(c.to)}</span>
      </td>
    </tr>`).join("");

  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 8px">Your Reservation Has Been Updated</h2>
<p style="color:#888;font-size:13px;margin:0 0 24px;line-height:1.6">
  Dear ${escapeHtml(b.passengerName.split(" ")[0])}, we have updated reservation
  <strong style="color:#c9a84c">${refNum}</strong>. Here is exactly what changed.
</p>

<div style="background:#0d0d0d;border:1px solid #c9a84c40;padding:20px;margin-bottom:20px">
  <p style="color:#c9a84c;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin:0 0 14px">What Changed</p>
  <table style="width:100%;border-collapse:collapse">${changeRows}</table>
</div>

<div style="background:#0d0d0d;border:1px solid #222;padding:20px;margin-bottom:20px">
  <p style="color:#c9a84c;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin:0 0 14px">Your Reservation Now</p>
  <table style="width:100%;border-collapse:collapse">
    ${row("Date &amp; Time", dateStr)}
    ${row("Pick-up", escapeHtml(b.pickupAddress))}
    ${row("Drop-off", escapeHtml(b.dropoffAddress))}
    ${b.flightNumber ? row("Flight", escapeHtml(b.flightNumber)) : ""}
    ${row("Passengers", String(b.passengers))}
  </table>
</div>

<p style="color:#888;font-size:12px;margin:0;line-height:1.6">
  If anything here is not what you expected, reply to this email or call us and we will put it right.
</p>`);
  await send(b.passengerEmail, `Reservation ${refNum} updated — please review`, html, "booking_updated_passenger");
}

export type ReminderEmailData = {
  id: number;
  passengerName: string;
  passengerEmail: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string;
  vehicleClass: string;
  passengers: number;
  priceQuoted: number;
  driverName?: string;
  driverPhone?: string;
  driverEarnings?: number;
};

export async function sendTripReminderPassenger(b: ReminderEmailData, leadLabel = "1 Hour") {
  const bookingRef = `RM-${String(b.id).padStart(4, "0")}`;
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 8px">Reminder: Your Ride is in ${escapeHtml(leadLabel)}</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">Hi ${escapeHtml(b.passengerName.split(" ")[0])}, this is a reminder that your Royal Midnight ride is scheduled in approximately ${escapeHtml(leadLabel.toLowerCase())}. Please be ready at your pickup location.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking #", bookingRef)}
  ${row("Pickup", escapeHtml(b.pickupAddress))}
  ${row("Dropoff", escapeHtml(b.dropoffAddress))}
  ${row("Date &amp; Time", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
  ${row("Vehicle", b.vehicleClass === "business" ? "Business Class Sedan" : "Premium SUV")}
  ${row("Passengers", String(b.passengers))}
  ${b.driverName ? row("Driver", escapeHtml(b.driverName)) : ""}
  ${b.driverPhone ? row("Driver Phone", escapeHtml(b.driverPhone)) : ""}
  ${row("Total Fare", `<span style="color:#c9a84c;font-weight:bold">$${b.priceQuoted.toFixed(2)}</span>`)}
</table>
<p style="margin-top:20px;color:#888;font-size:12px">
  Please ensure you are at the pickup location on time. If you need to reach your driver, use the contact details above.<br>
  <strong style="color:#c9a84c">Royal Midnight Luxury Transportation</strong>
</p>`);
  await send(b.passengerEmail, `Reminder: Your Royal Midnight Ride in ${leadLabel} — ${bookingRef}`, html, "trip_reminder_passenger");
}

export async function sendTripReminderDriver(b: ReminderEmailData, driverEmail: string, leadLabel = "1 Hour") {
  const bookingRef = `RM-${String(b.id).padStart(4, "0")}`;
  const earnings = b.driverEarnings != null ? `$${b.driverEarnings.toFixed(2)}` : "—";
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 8px">Reminder: Upcoming Pickup in ${escapeHtml(leadLabel)}</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">This is a reminder that you have a scheduled pickup in approximately ${escapeHtml(leadLabel.toLowerCase())}. Please review the trip details and be on time.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking #", bookingRef)}
  ${row("Passenger", escapeHtml(b.passengerName))}
  ${row("Pickup", escapeHtml(b.pickupAddress))}
  ${row("Dropoff", escapeHtml(b.dropoffAddress))}
  ${row("Date &amp; Time", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
  ${row("Vehicle", b.vehicleClass === "business" ? "Business Class Sedan" : "Premium SUV")}
  ${row("Passengers", String(b.passengers))}
  ${row("Your Earnings", `<span style="color:#c9a84c;font-weight:bold">${earnings}</span>`)}
</table>
<p style="margin-top:20px;color:#888;font-size:12px">
  Please be at the pickup location promptly at the scheduled time.<br>
  <strong style="color:#c9a84c">Royal Midnight Luxury Transportation</strong>
</p>`);
  await send(driverEmail, `Reminder: Pickup in ${leadLabel} — ${bookingRef} (${b.passengerName})`, html, "trip_reminder_driver");
}

export async function sendWeeklyDriverPayout(params: {
  driverName: string;
  driverEmail: string;
  weekLabel: string;
  rides: number;
  grossEarnings: number;
  commissionPct: number;
  /** Commission on grossEarnings, computed by lib/weeklyPayouts.ts. */
  commission: number;
  /** Add-ons the chauffeur keeps in full, with no commission taken. */
  extrasTotal: number;
  tipsTotal: number;
  driverNet: number;
  bankName: string | null;
  routingNumber: string | null;
  /** Last four digits, already decrypted by the caller. */
  accountLast4: string | null;
  legalName: string | null;
}) {
  const {
    driverName, driverEmail, weekLabel, rides,
    grossEarnings, commissionPct, commission, extrasTotal, tipsTotal, driverNet,
    bankName, accountLast4,
  } = params;

  const commPctDisplay = `${Math.round(commissionPct * 100)}%`;
  // The caller supplies the last four. This used to receive the whole
  // payout_account_number column and slice(-4) it — but that column is AES-GCM
  // ciphertext, so the mask shown to the chauffeur was four characters of
  // encrypted data. And `commission` used to be recomputed here from
  // grossEarnings, a third copy of the formula that no longer added up to
  // driverNet once add-ons entered the payout.
  const maskAccount = accountLast4 ? `****${accountLast4}` : "Not on file";

  const html = wrap(`
<h2 style="color:#c9a84c;font-family:Georgia,serif;margin:0 0 6px">Weekly Earnings Statement</h2>
<p style="color:#9ca3af;margin:0 0 24px;font-size:14px">${weekLabel}</p>
<p style="color:#e8e0d0;">Dear ${escapeHtml(driverName)},</p>
<p style="color:#9ca3af;line-height:1.6;">Here is your earnings summary for the week of <strong style="color:#e8e0d0">${weekLabel}</strong>.</p>
<table style="width:100%;border-collapse:collapse;margin:20px 0;">
  ${row("Total Rides", String(rides))}
  ${row("Gross Revenue", `$${grossEarnings.toFixed(2)}`)}
  ${row("Your Commission Rate", commPctDisplay)}
  ${row("Commission Earnings", `$${commission.toFixed(2)}`)}
  ${extrasTotal > 0 ? row("Add-ons (paid in full)", `<span style='color:#c9a84c'>+$${extrasTotal.toFixed(2)}</span>`) : ""}
  ${tipsTotal > 0 ? row("Tips Earned", `<span style='color:#c9a84c'>+$${tipsTotal.toFixed(2)}</span>`) : ""}
  ${row("Total Payout", `<strong style='color:#c9a84c;font-size:18px'>$${driverNet.toFixed(2)}</strong>`)}
</table>
${bankName ? `
<p style="color:#9ca3af;font-size:13px;margin:20px 0 8px;">Payout will be sent to:</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
  ${row("Bank", escapeHtml(bankName))}
  ${row("Account", maskAccount)}
</table>
` : `
<p style="color:#f59e0b;font-size:13px;border:1px solid #92400e;padding:12px;margin:20px 0;">
  No bank details on file. Please contact Royal Midnight to add your banking information.
</p>
`}
<p style="color:#6b7280;font-size:12px;margin-top:24px;">If you have any questions about this statement, please contact <a href="mailto:${ADMIN_EMAIL}" style="color:#c9a84c;">${ADMIN_EMAIL}</a>.</p>`);

  await send(driverEmail, `Royal Midnight — Weekly Earnings: $${driverNet.toFixed(2)} (${weekLabel})`, html, "weekly_driver_payout");
}

export async function sendWeeklyPayoutAdminReport(params: {
  weekLabel: string;
  commissionPct: number;
  totalGross: number;
  totalDriverNet: number;
  payouts: Array<{
    driverName: string;
    driverEmail: string;
    rides: number;
    grossEarnings: number;
    extrasTotal: number;
    tipsTotal: number;
    driverNet: number;
    bankName: string | null;
    routingNumber: string | null;
    /** Last four digits, already decrypted by the caller. */
    accountLast4: string | null;
    legalName: string | null;
  }>;
}) {
  const { weekLabel, commissionPct, totalGross, totalDriverNet, payouts } = params;
  const commPctDisplay = `${Math.round(commissionPct * 100)}%`;
  // totalGross here is the commission base for the week — fares and overtime
  // before tax, the card fee and add-ons — so what is left after payouts is the
  // company's share of the fare, NOT its net income. It was labelled
  // "Company Net", which is the figure the Reports screen shows and a different
  // number entirely.
  const companyFareShare = Math.round((totalGross - totalDriverNet) * 100) / 100;
  const totalTips = Math.round(payouts.reduce((s, p) => s + (p.tipsTotal ?? 0), 0) * 100) / 100;
  const totalExtras = Math.round(payouts.reduce((s, p) => s + (p.extrasTotal ?? 0), 0) * 100) / 100;

  const driverRows = payouts.map(p => `
<tr style="border-bottom:1px solid #27272a;">
  <td style="padding:10px 8px;color:#e8e0d0;">${escapeHtml(p.driverName)}</td>
  <td style="padding:10px 8px;color:#9ca3af;font-size:13px;">${escapeHtml(p.driverEmail)}</td>
  <td style="padding:10px 8px;text-align:center;color:#e8e0d0;">${p.rides}</td>
  <td style="padding:10px 8px;text-align:right;color:#e8e0d0;">$${p.grossEarnings.toFixed(2)}</td>
  <td style="padding:10px 8px;text-align:right;color:#9ca3af;">${p.tipsTotal > 0 ? `<span style="color:#c9a84c">+$${p.tipsTotal.toFixed(2)}</span>` : "—"}</td>
  <td style="padding:10px 8px;text-align:right;color:#c9a84c;font-weight:600;">$${p.driverNet.toFixed(2)}</td>
  <td style="padding:10px 8px;color:#9ca3af;font-size:12px;">${p.bankName ? escapeHtml(p.bankName) : '<span style="color:#ef4444">Missing</span>'}</td>
  <td style="padding:10px 8px;color:#9ca3af;font-size:12px;font-family:monospace;">${p.routingNumber ? escapeHtml(p.routingNumber) : '—'}</td>
  <td style="padding:10px 8px;color:#9ca3af;font-size:12px;font-family:monospace;">${p.accountLast4 ? `****${escapeHtml(p.accountLast4)}` : '—'}</td>
</tr>`).join("");

  const html = wrap(`
<h2 style="color:#c9a84c;font-family:Georgia,serif;margin:0 0 6px">Weekly Payout Report</h2>
<p style="color:#9ca3af;margin:0 0 24px;font-size:14px">${weekLabel} — For Admin Review</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
  ${row("Week", weekLabel)}
  ${row("Commission Base (fares + overtime, pre-tax)", `$${totalGross.toFixed(2)}`)}
  ${totalExtras > 0 ? row("Add-ons Paid in Full", `<span style="color:#c9a84c">+$${totalExtras.toFixed(2)}</span>`) : ""}
  ${totalTips > 0 ? row("Total Tips", `<span style="color:#c9a84c">+$${totalTips.toFixed(2)}</span>`) : ""}
  ${row(`Total Driver Payouts (${commPctDisplay} + add-ons + tips)`, `$${totalDriverNet.toFixed(2)}`)}
  ${row("Company Share of Fares", `<strong style='color:#22c55e'>$${companyFareShare.toFixed(2)}</strong>`)}
</table>
<p style="color:#6b7280;font-size:11px;margin:-16px 0 24px;">
  Fare figures only — taxes, the card processing fee and add-ons the company keeps are not in this table.
  See Reports for company net income.
</p>
<h3 style="color:#c9a84c;margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:0.1em;">Driver Breakdown</h3>
<div style="overflow-x:auto;">
<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead>
    <tr style="border-bottom:1px solid #3f3f46;background:#18181b;">
      <th style="padding:8px;text-align:left;color:#9ca3af;text-transform:uppercase;font-size:11px;letter-spacing:0.05em;">Driver</th>
      <th style="padding:8px;text-align:left;color:#9ca3af;text-transform:uppercase;font-size:11px;">Email</th>
      <th style="padding:8px;text-align:center;color:#9ca3af;text-transform:uppercase;font-size:11px;">Rides</th>
      <th style="padding:8px;text-align:right;color:#9ca3af;text-transform:uppercase;font-size:11px;">Gross</th>
      <th style="padding:8px;text-align:right;color:#9ca3af;text-transform:uppercase;font-size:11px;">Tips</th>
      <th style="padding:8px;text-align:right;color:#9ca3af;text-transform:uppercase;font-size:11px;">Total to Driver</th>
      <th style="padding:8px;text-align:left;color:#9ca3af;text-transform:uppercase;font-size:11px;">Bank</th>
      <th style="padding:8px;text-align:left;color:#9ca3af;text-transform:uppercase;font-size:11px;">Routing</th>
      <th style="padding:8px;text-align:left;color:#9ca3af;text-transform:uppercase;font-size:11px;">Account</th>
    </tr>
  </thead>
  <tbody>${driverRows}</tbody>
</table>
</div>
<p style="color:#6b7280;font-size:12px;margin-top:24px;">This is an automated report from Royal Midnight. Please verify all bank details before processing transfers.</p>`);

  await send(ADMIN_EMAIL, `Royal Midnight — Weekly Payout Report (${weekLabel})`, html, "weekly_payout_admin_report");
}

export async function sendPasswordResetEmail(to: string, passengerName: string, resetLink: string) {
  const html = wrap(`
<h2 style="color:#ffffff;margin:0 0 8px;font-size:22px;font-weight:600">Reset Your Password</h2>
<p style="color:#9ca3af;margin:0 0 20px;font-size:14px">Royal Midnight — Secure Account Recovery</p>
<p style="color:#e5e7eb;font-size:15px;margin:0 0 16px">Hello ${escapeHtml(passengerName)},</p>
<p style="color:#9ca3af;font-size:14px;margin:0 0 24px">
  We received a request to reset your Royal Midnight password. Click the button below to choose a new password.
  This link expires in <strong style="color:#e5e7eb">30 minutes</strong>.
</p>
<p style="text-align:center;margin:0 0 24px;">
  <a href="${resetLink}" style="background:#c9a84c;color:#050505;padding:12px 32px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px;display:inline-block">RESET PASSWORD</a>
</p>
<p style="color:#6b7280;font-size:12px;margin:0 0 8px">
  If you did not request a password reset, you can safely ignore this email — your password will not change.
</p>
<p style="color:#4b5563;font-size:11px;word-break:break-all">
  If the button above doesn't work, copy and paste this link into your browser:<br>${resetLink}
</p>`);

  await send(to, "Reset Your Royal Midnight Password", html, "password_reset");
}

export async function sendDriverAccountSetupEmail(to: string, driverName: string, setupLink: string) {
  const html = wrap(`
<h2 style="color:#ffffff;margin:0 0 8px;font-size:22px;font-weight:600">Welcome to Royal Midnight</h2>
<p style="color:#9ca3af;margin:0 0 20px;font-size:14px">Your Driver Account Is Ready</p>
<p style="color:#e5e7eb;font-size:15px;margin:0 0 16px">Hello ${escapeHtml(driverName)},</p>
<p style="color:#9ca3af;font-size:14px;margin:0 0 24px">
  An account has been created for you on the Royal Midnight driver portal. Click the button below to set your
  password. Once you're signed in, you'll be able to upload your driver's license, vehicle registration, and
  insurance documents. This link expires in <strong style="color:#e5e7eb">7 days</strong>.
</p>
<p style="text-align:center;margin:0 0 24px;">
  <a href="${setupLink}" style="background:#c9a84c;color:#050505;padding:12px 32px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px;display:inline-block">SET UP MY ACCOUNT</a>
</p>
<p style="color:#4b5563;font-size:11px;word-break:break-all">
  If the button above doesn't work, copy and paste this link into your browser:<br>${setupLink}
</p>`);

  await send(to, "Welcome to Royal Midnight — Set Up Your Driver Account", html, "driver_account_setup");
}

/** Sent to the applicant right after POST /auth/driver-register succeeds.
 *  Confirms the three required documents actually arrived — the applicant's
 *  only other signal is the in-app "Application Submitted" screen, which is
 *  gone the moment they close the tab. */
export async function sendDriverApplicationReceived(to: string, driverName: string) {
  const html = wrap(`
<h2 style="color:#ffffff;margin:0 0 8px;font-size:22px;font-weight:600">Application Received</h2>
<p style="color:#e5e7eb;font-size:15px;margin:0 0 16px">Hello ${escapeHtml(driverName)},</p>
<p style="color:#9ca3af;font-size:14px;margin:0 0 16px">
  Thank you for applying to join the Royal Midnight fleet. We've received your license, vehicle registration and
  insurance documents, and our team will review your application shortly.
</p>
<p style="color:#9ca3af;font-size:14px;margin:0 0 24px">
  This typically takes 1&ndash;2 business days. You'll get another email the moment a decision is made, with
  instructions for setting up billing if you're approved.
</p>`);
  await send(to, "Royal Midnight — Application Received", html, "driver_application_received");
}

/** Sent to admin the moment a driver application lands — the only place a
 *  pending application otherwise surfaces is the "My Fleet" table in /admin,
 *  which nothing prompts anyone to go check. */
export async function sendNewDriverApplicationAdmin(params: {
  driverId: number;
  name: string;
  email: string;
  phone: string;
  serviceArea?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: string | null;
}) {
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const vehicle = [params.vehicleYear, params.vehicleMake, params.vehicleModel].filter(Boolean).join(" ");
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 4px">New Driver Application</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">A chauffeur applicant is awaiting review.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Name", escapeHtml(params.name))}
  ${row("Email", escapeHtml(params.email))}
  ${row("Phone", escapeHtml(params.phone))}
  ${params.serviceArea ? row("Service Area", escapeHtml(params.serviceArea)) : ""}
  ${vehicle ? row("Vehicle", escapeHtml(vehicle)) : ""}
</table>
<p style="margin-top:24px"><a href="${appUrl}/admin/drivers" style="background:#c9a84c;color:#050505;padding:10px 24px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px">REVIEW APPLICATION</a></p>`);
  await send(ADMIN_EMAIL, `New Driver Application — ${params.name}`, html, "new_driver_application_admin");
}

// ─── Compliance Emails ────────────────────────────────────────────────────────

export async function sendComplianceReminder(params: {
  to: string;
  driverName: string;
  docType: string;
  expiryDate: string;
  daysRemaining: number;
  dashboardUrl?: string;
}) {
  const { to, driverName, docType, expiryDate, daysRemaining, dashboardUrl = "https://royalmidnight.com/driver/documents" } = params;
  const safeDocType = escapeHtml(docType);
  const urgency = daysRemaining <= 0 ? "EXPIRED" : daysRemaining <= 7 ? "CRITICAL" : "REMINDER";
  const color = daysRemaining <= 0 ? "#ef4444" : daysRemaining <= 7 ? "#f97316" : "#c9a84c";
  const statusText = daysRemaining <= 0
    ? `Your ${safeDocType} has <strong style="color:#ef4444">EXPIRED</strong>.`
    : daysRemaining === 0
    ? `Your ${safeDocType} expires <strong style="color:#f97316">TODAY</strong>.`
    : `Your ${safeDocType} expires in <strong style="color:${color}">${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}</strong> (${expiryDate}).`;

  const html = wrap(`
<h2 style="color:#ffffff;margin:0 0 8px;font-size:22px;font-weight:600">Document ${urgency}: ${safeDocType}</h2>
<p style="color:#9ca3af;margin:0 0 20px;font-size:14px">Royal Midnight — Compliance Notice</p>
<p style="color:#e5e7eb;font-size:15px;margin:0 0 16px">Hello ${escapeHtml(driverName)},</p>
<p style="color:#9ca3af;font-size:14px;margin:0 0 24px">${statusText}</p>
<p style="color:#9ca3af;font-size:14px;margin:0 0 24px">
  To continue accepting rides, please upload a renewed copy of your ${safeDocType} through your driver dashboard immediately.
  ${daysRemaining <= 0 ? "<strong style=\"color:#ef4444\">Your account has been placed on hold until a valid document is approved.</strong>" : ""}
</p>
<p style="text-align:center;margin:0 0 24px;">
  <a href="${dashboardUrl}" style="background:#c9a84c;color:#050505;padding:12px 32px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px;display:inline-block">UPLOAD DOCUMENT</a>
</p>
<p style="color:#6b7280;font-size:12px;margin:0">
  Once your document is reviewed and approved by the Royal Midnight team, your account will be fully reinstated.
</p>`);

  await send(to, `[Action Required] Your ${docType} ${daysRemaining <= 0 ? "has expired" : `expires in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`}`, html, "compliance_reminder");
}

export async function sendComplianceLockoutAdmin(params: {
  driverName: string;
  driverEmail: string;
  docType: string;
  expiryDate: string;
  ridesUnassigned: number;
}) {
  const { driverName, driverEmail, docType, expiryDate, ridesUnassigned } = params;
  const html = wrap(`
<h2 style="color:#ef4444;margin:0 0 8px;font-size:22px;font-weight:600">🚨 URGENT: Driver Account Locked Out</h2>
<p style="color:#9ca3af;margin:0 0 20px;font-size:14px">Royal Midnight — Compliance Enforcement</p>
<div style="background:#1c0a0a;border:1px solid #ef4444;padding:16px;margin-bottom:24px">
  <p style="color:#ef4444;font-weight:bold;margin:0 0 8px;font-size:15px">Automatic Compliance Hold Applied</p>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="color:#9ca3af;padding:4px 0;width:140px">Driver</td><td style="color:#e5e7eb">${escapeHtml(driverName)} &lt;${escapeHtml(driverEmail)}&gt;</td></tr>
    <tr><td style="color:#9ca3af;padding:4px 0">Expired Document</td><td style="color:#ef4444;font-weight:bold">${escapeHtml(docType)}</td></tr>
    <tr><td style="color:#9ca3af;padding:4px 0">Expiry Date</td><td style="color:#e5e7eb">${expiryDate}</td></tr>
    <tr><td style="color:#9ca3af;padding:4px 0">Rides Unassigned</td><td style="color:#f97316;font-weight:bold">${ridesUnassigned} ride${ridesUnassigned !== 1 ? "s" : ""} returned to Dispatch pool</td></tr>
  </table>
</div>
<p style="color:#e5e7eb;font-size:14px;margin:0 0 16px">
  ${ridesUnassigned > 0
    ? `<strong style="color:#f97316">${ridesUnassigned} upcoming ride${ridesUnassigned !== 1 ? "s have" : " has"} been automatically moved back to the Unassigned Dispatch pool.</strong> Please reassign them immediately.`
    : "No upcoming rides were affected."}
</p>
<p style="color:#9ca3af;font-size:14px;margin:0 0 24px">
  The driver's account will automatically unlock once you approve their renewed ${escapeHtml(docType)} in the Fleet → Compliance tab.
</p>
<p style="text-align:center;margin:0 0 24px;">
  <a href="https://royalmidnight.com/admin/fleet" style="background:#ef4444;color:#ffffff;padding:12px 32px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px;display:inline-block">REVIEW COMPLIANCE</a>
</p>`);

  await send(ADMIN_EMAIL, `🚨 URGENT: ${driverName} locked out — ${docType} expired — ${ridesUnassigned} ride${ridesUnassigned !== 1 ? "s" : ""} unassigned`, html, "compliance_lockout_admin");
}

// ─── Referral program ─────────────────────────────────────────────────────────

export async function sendReferralWelcomeEmail(params: { name: string; email: string; promoCode: string; amount: number }) {
  const { name, email, promoCode, amount } = params;
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const safePromoCode = escapeHtml(promoCode);
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 8px">Welcome to Royal Midnight — Here's $${amount.toFixed(0)} On Us</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">Hi ${escapeHtml(name.split(" ")[0])}, you joined through a friend's referral — thank you. Use the code below on your first booking to save $${amount.toFixed(0)}.</p>
<div style="text-align:center;margin:20px 0">
  <span style="display:inline-block;background:#111;border:1px dashed #c9a84c;color:#c9a84c;font-size:20px;font-weight:bold;letter-spacing:2px;padding:14px 28px">${safePromoCode}</span>
</div>
<p style="margin-top:20px">
  <a href="${appUrl}/book" style="background:#c9a84c;color:#050505;padding:10px 24px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px">BOOK YOUR FIRST RIDE</a>
</p>
<p style="margin-top:20px;color:#888;font-size:12px">
  Enter this code at checkout. One-time use, no expiration.<br>
  <strong style="color:#c9a84c">Royal Midnight Luxury Transportation</strong>
</p>`);
  await send(email, `Welcome to Royal Midnight — Your $${amount.toFixed(0)} Code Inside`, html, "referral_welcome");
}

export async function sendReferralRewardEmail(params: { referrerName: string; referrerEmail: string; refereeName: string; promoCode: string; amount: number }) {
  const { referrerName, referrerEmail, refereeName, promoCode, amount } = params;
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const safePromoCode = escapeHtml(promoCode);
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 8px">You Just Earned $${amount.toFixed(0)}</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">Hi ${escapeHtml(referrerName.split(" ")[0])}, ${escapeHtml(refereeName.split(" ")[0])} just completed their first ride with Royal Midnight — thanks for the referral! Here is your reward code.</p>
<div style="text-align:center;margin:20px 0">
  <span style="display:inline-block;background:#111;border:1px dashed #c9a84c;color:#c9a84c;font-size:20px;font-weight:bold;letter-spacing:2px;padding:14px 28px">${safePromoCode}</span>
</div>
<p style="margin-top:20px">
  <a href="${appUrl}/book" style="background:#c9a84c;color:#050505;padding:10px 24px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px">BOOK YOUR NEXT RIDE</a>
</p>
<p style="margin-top:20px;color:#888;font-size:12px">
  Keep sharing your referral link from your passenger dashboard to keep earning.<br>
  <strong style="color:#c9a84c">Royal Midnight Luxury Transportation</strong>
</p>`);
  await send(referrerEmail, `You Earned $${amount.toFixed(0)} — Royal Midnight Referral Reward`, html, "referral_reward");
}

// ─── Review requests ───────────────────────────────────────────────────────────

export async function sendReviewRequestEmail(b: BookingEmailData) {
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const bookingRef = `RM-${String(b.id).padStart(4, "0")}`;
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 8px">How Was Your Ride?</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">Hi ${escapeHtml(b.passengerName.split(" ")[0])}, thank you again for riding with Royal Midnight. Your feedback helps us keep every chauffeur and vehicle at the standard you expect — it only takes a minute.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking", bookingRef)}
  ${row("Route", `${escapeHtml(b.pickupAddress)} → ${escapeHtml(b.dropoffAddress)}`)}
  ${row("Date", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
</table>
<p style="margin-top:28px">
  <a href="${appUrl}/passenger/rides/${b.id}" style="background:#c9a84c;color:#050505;padding:10px 24px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px">LEAVE A REVIEW</a>
</p>
<p style="margin-top:20px;color:#888;font-size:12px">
  <strong style="color:#c9a84c">Royal Midnight Luxury Transportation</strong>
</p>`);
  await send(b.passengerEmail, `How was your ride? — Royal Midnight ${bookingRef}`, html, "review_request");
}

/**
 * Operations copies of the trip reminders.
 *
 * The 24h and 2h reminders go to the passenger and the driver — and to the
 * admin, who previously received nothing at all between booking creation and
 * the trip itself. When booking #6 went out with no driver ever confirming,
 * there was no point at which anyone in the office was told.
 */
export async function sendTripReminderAdmin(b: ReminderEmailData, leadLabel: string) {
  const bookingRef = `RM-${String(b.id).padStart(4, "0")}`;
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 8px">Upcoming Trip in ${escapeHtml(leadLabel)}</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">Operations reminder — no action needed unless the driver has not confirmed.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking #", bookingRef)}
  ${row("Passenger", escapeHtml(b.passengerName))}
  ${row("Pickup", escapeHtml(b.pickupAddress))}
  ${row("Dropoff", escapeHtml(b.dropoffAddress))}
  ${row("Date &amp; Time", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
  ${row("Driver", b.driverName ? escapeHtml(b.driverName) : '<span style="color:#e11d48">UNASSIGNED</span>')}
  ${b.driverPhone ? row("Driver Phone", escapeHtml(b.driverPhone)) : ""}
  ${row("Total Fare", `$${b.priceQuoted.toFixed(2)}`)}
</table>`);
  await send(ADMIN_EMAIL, `Trip in ${leadLabel} — ${bookingRef} (${b.passengerName})`, html, "trip_reminder_admin");
}

/**
 * The assigned driver did not confirm in time and lost the trip.
 *
 * This is the alert that did not exist: a driver going quiet was invisible
 * until the passenger was left waiting.
 */
export async function sendDriverReleasedAdmin(params: {
  bookingId: number;
  passengerName: string;
  pickupAddress: string;
  pickupAt: string;
  driverName: string;
  driverPhone: string;
  warningCount: number;
  suspended: boolean;
}) {
  const bookingRef = `RM-${String(params.bookingId).padStart(4, "0")}`;
  const html = wrap(`
<h2 style="color:#e11d48;font-size:20px;margin:0 0 8px">Driver removed — no confirmation</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">
  ${escapeHtml(params.driverName)} did not confirm they were on the way within one hour of pickup,
  so the trip has been returned to the open pool for every other driver. It will not be shown to them again.
</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking #", bookingRef)}
  ${row("Passenger", escapeHtml(params.passengerName))}
  ${row("Pickup", escapeHtml(params.pickupAddress))}
  ${row("Pickup Time", new Date(params.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
  ${row("Driver Removed", `${escapeHtml(params.driverName)} (${escapeHtml(params.driverPhone)})`)}
  ${row("Warnings", `<span style="color:#e11d48;font-weight:bold">${params.warningCount}</span>`)}
  ${params.suspended ? row("Account", '<span style="color:#e11d48;font-weight:bold">SUSPENDED — reached 3 warnings</span>') : ""}
</table>
<p style="margin-top:20px;color:#888;font-size:12px">
  If no other driver accepts, cancel the booking from the admin panel — that refunds the passenger in full.
</p>`);
  await send(ADMIN_EMAIL, `ACTION NEEDED: driver removed from ${bookingRef}`, html, "driver_released_admin");
}

/** Tells the driver why they lost the trip, and where that leaves their account. */
export async function sendDriverNoConfirmationWarning(params: {
  driverEmail: string;
  driverName: string;
  bookingId: number;
  pickupAt: string;
  warningCount: number;
  suspended: boolean;
}) {
  const bookingRef = `RM-${String(params.bookingId).padStart(4, "0")}`;
  const html = wrap(`
<h2 style="color:#e11d48;font-size:20px;margin:0 0 8px">Trip ${bookingRef} was removed from your schedule</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">
  Hi ${escapeHtml(params.driverName.split(" ")[0] ?? "")}, you did not mark yourself as on the way within one hour of the
  scheduled pickup, so this trip has been reassigned and a warning has been added to your account.
</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking #", bookingRef)}
  ${row("Scheduled Pickup", new Date(params.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
  ${row("Warnings on your account", `<span style="color:#e11d48;font-weight:bold">${params.warningCount} of 3</span>`)}
</table>
<p style="margin-top:20px;color:#888;font-size:12px">
  ${params.suspended
    ? '<strong style="color:#e11d48">Your account has been suspended after three warnings. Contact the office to be reinstated.</strong>'
    : "To avoid this, open the app and confirm you are on the way as soon as you set off. Three warnings suspends your account."}<br>
  <strong style="color:#c9a84c">Royal Midnight Luxury Transportation</strong>
</p>`);
  await send(params.driverEmail, `Warning: trip ${bookingRef} removed — no confirmation`, html, "driver_warning");
}

// ─── Support ──────────────────────────────────────────────────────────────────
//
// Support tickets were a silent inbox. A customer filled in the contact form,
// the row landed in support_tickets, and nothing anywhere said so — the only
// way to discover it was for an administrator to open the Support screen and
// look. The reply box on that screen says "Type your reply to the passenger",
// and the reply likewise went nowhere: it sat in ticket_messages until the
// passenger happened to reopen their own Support page.
//
// Both directions are best-effort. A ticket that exists but was not announced
// is recoverable; a ticket rejected because an email bounced is not.

export async function notifyNewSupportTicket(t: {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  priority: string;
}) {
  const ref = `#${t.id}`;
  const html = wrap(`
<h2 style="color:#c9a84c;font-family:Georgia,serif;margin:0 0 6px">New Support Ticket ${ref}</h2>
<p style="color:#9ca3af;margin:0 0 20px;font-size:14px">Priority: ${escapeHtml(t.priority)}</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:20px">
  ${row("From", escapeHtml(t.name))}
  ${row("Email", escapeHtml(t.email))}
  ${row("Subject", escapeHtml(t.subject))}
</table>
<div style="background:#18181b;border:1px solid #27272a;padding:16px;color:#e8e0d0;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(t.message)}</div>
<p style="color:#6b7280;font-size:12px;margin-top:20px">Reply from the Support screen in the admin portal.</p>`);
  await send(ADMIN_EMAIL, `Support ${ref}: ${t.subject}`, html, "support_ticket_new");
}

export async function notifySupportReply(p: {
  ticketId: number;
  subject: string;
  message: string;
  /** True when an administrator wrote it — the passenger is the recipient. */
  fromAdmin: boolean;
  passengerName: string;
  passengerEmail: string;
}) {
  const ref = `#${p.ticketId}`;
  const body = `<div style="background:#18181b;border:1px solid #27272a;padding:16px;color:#e8e0d0;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(p.message)}</div>`;

  if (p.fromAdmin) {
    const html = wrap(`
<h2 style="color:#c9a84c;font-family:Georgia,serif;margin:0 0 6px">Re: ${escapeHtml(p.subject)}</h2>
<p style="color:#9ca3af;margin:0 0 20px;font-size:14px">Ticket ${ref}</p>
<p style="color:#e8e0d0">Hello ${escapeHtml(String(p.passengerName ?? "").split(" ")[0] ?? "")},</p>
<p style="color:#9ca3af;line-height:1.6">Our team has replied to your enquiry:</p>
${body}
<p style="color:#6b7280;font-size:12px;margin-top:20px">You can continue the conversation from the Support page in your Royal Midnight account.</p>`);
    await send(p.passengerEmail, `Royal Midnight Support — ${p.subject} (${ref})`, html, "support_reply_passenger");
    return;
  }

  const html = wrap(`
<h2 style="color:#c9a84c;font-family:Georgia,serif;margin:0 0 6px">Customer replied — ${ref}</h2>
<p style="color:#9ca3af;margin:0 0 20px;font-size:14px">${escapeHtml(p.passengerName)} (${escapeHtml(p.passengerEmail)}) · ${escapeHtml(p.subject)}</p>
${body}`);
  await send(ADMIN_EMAIL, `Support ${ref}: customer replied`, html, "support_reply_admin");
}

/**
 * Receipt for extra time collected after the trip.
 *
 * The completion email goes out the moment the chauffeur ends the trip, which
 * is before the extra-time charge is known to have succeeded — and for every
 * charter completed before that charge existed, the money is taken days later
 * from the admin screen. Taking money off someone's card with no message is not
 * something to leave to a screen they may never open.
 */
export async function sendExtraTimeChargedEmail(p: {
  bookingId: number;
  passengerName: string;
  passengerEmail: string;
  overtimeMinutes: number;
  fare: number;
  taxAmount: number;
  cardProcessingFee: number;
  total: number;
}) {
  const bookingRef = `RM-${String(p.bookingId).padStart(4, "0")}`;
  const html = wrap(`
<h2 style="color:#c9a84c;font-family:Georgia,serif;margin:0 0 6px">Additional time — ${bookingRef}</h2>
<p style="color:#e8e0d0">Hello ${escapeHtml(String(p.passengerName ?? "").split(" ")[0] ?? "")},</p>
<p style="color:#9ca3af;line-height:1.6">
  Your chauffeur service ran ${p.overtimeMinutes} minutes past the time included in your booking.
  Past the first 20 minutes, additional time is charged by the whole hour, as set out when you booked.
  We have charged the card on file:
</p>
<table style="width:100%;border-collapse:collapse;margin:20px 0">
  ${row("Additional time", `$${p.fare.toFixed(2)}`)}
  ${p.taxAmount > 0 ? row("Florida tax", `$${p.taxAmount.toFixed(2)}`) : ""}
  ${p.cardProcessingFee > 0 ? row("Card processing", `$${p.cardProcessingFee.toFixed(2)}`) : ""}
  ${row("Total charged", `<strong style="color:#c9a84c;font-size:16px">$${p.total.toFixed(2)}</strong>`)}
</table>
<p style="color:#6b7280;font-size:12px">
  The full receipt is on your trip page. If anything here looks wrong, reply to this message or contact
  <a href="mailto:${ADMIN_EMAIL}" style="color:#c9a84c">${ADMIN_EMAIL}</a> and we will look into it.
</p>`);
  await send(p.passengerEmail, `Royal Midnight — additional time charged (${bookingRef})`, html, "extra_time_charged");
}
