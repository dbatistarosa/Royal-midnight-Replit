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

<p style="color:#e8e0d0;font-size:14px;margin:0 0 4px">Dear ${b.passengerName.split(" ")[0]},</p>
<p style="color:#888;font-size:13px;margin:0 0 24px;line-height:1.6">
  Your payment has been received and your reservation is confirmed. Below is your booking receipt — please keep it for your records.
</p>

<div style="background:#0d0d0d;border:1px solid #222;padding:20px;margin-bottom:20px">
  <p style="color:#c9a84c;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin:0 0 14px">Itinerary</p>
  <table style="width:100%;border-collapse:collapse">
    ${row("Date &amp; Time", dateStr)}
    ${row("Pick-up", b.pickupAddress)}
    ${row("Drop-off", b.dropoffAddress)}
    ${b.flightNumber ? row("Flight", b.flightNumber) : ""}
  </table>
</div>

<div style="background:#0d0d0d;border:1px solid #222;padding:20px;margin-bottom:20px">
  <p style="color:#c9a84c;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin:0 0 14px">Vehicle &amp; Passengers</p>
  <table style="width:100%;border-collapse:collapse">
    ${row("Vehicle", vehicleLabel)}
    ${row("Passengers", String(b.passengers))}
    ${b.specialRequests ? row("Special Requests", b.specialRequests) : ""}
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
  ${row("Passenger", b.passengerName)}
  ${row("Email", b.passengerEmail)}
  ${row("Pickup", b.pickupAddress)}
  ${row("Dropoff", b.dropoffAddress)}
  ${row("Date &amp; Time", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
  ${row("Vehicle", vehicleLabel)}
  ${row("Passengers", String(b.passengers))}
  ${row("Total Fare", `<strong style="color:#c9a84c">$${b.priceQuoted.toFixed(2)}</strong>`)}
  ${b.flightNumber ? row("Flight", b.flightNumber) : ""}
  ${b.specialRequests ? row("Special Requests", b.specialRequests) : ""}
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
  ${row("Pick-up", b.pickupAddress)}
  ${row("Drop-off", b.dropoffAddress)}
  ${row("Vehicle", vehicleLabel)}
  ${row("Passengers", String(b.passengers))}
  ${b.flightNumber ? row("Flight", b.flightNumber) : ""}
  ${b.specialRequests ? row("Special Requests", b.specialRequests) : ""}
</table>
<p style="margin-top:24px"><a href="${appUrl}/driver/dashboard" style="background:#c9a84c;color:#050505;padding:12px 28px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px">ACCEPT THIS RIDE</a></p>
<p style="margin-top:16px;color:#666;font-size:11px">Log in to the driver portal to view full details and accept the ride.</p>`);
  await send(driverEmails, `New Ride ${refNum} — ${earnings} earnings`, html, "new_booking_drivers");
}

export async function sendBookingCancelledAdmin(b: BookingEmailData) {
  const html = wrap(`
<h2 style="color:#ef4444;font-size:20px;margin:0 0 20px">Booking #${b.id} Cancelled</h2>
<table style="width:100%;border-collapse:collapse">
  ${row("Passenger", b.passengerName)}
  ${row("Email", b.passengerEmail)}
  ${row("Pickup", b.pickupAddress)}
  ${row("Dropoff", b.dropoffAddress)}
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
<p style="color:#888;font-size:13px;margin:0 0 20px">Great news, ${b.passengerName.split(" ")[0]}. A driver has been assigned to your reservation. Details are below.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking #", `RM-${String(b.id).padStart(4, "0")}`)}
  ${row("Driver", driverName)}
  ${row("Phone", driverPhone)}
  ${row("Vehicle", vehicleDescription)}
  ${row("Pickup", b.pickupAddress)}
  ${row("Dropoff", b.dropoffAddress)}
  ${row("Date &amp; Time", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
  ${b.flightNumber ? row("Flight", b.flightNumber) : ""}
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
  ${row("Driver", driverName)}
  ${row("Driver Email", driverEmail)}
  ${row("Passenger", b.passengerName)}
  ${row("Pickup", b.pickupAddress)}
  ${row("Dropoff", b.dropoffAddress)}
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
  ${row("Passenger", passengerName)}
  ${row("Unassigned Driver", driverName)}
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
  ${row("Passenger", b.passengerName)}
  ${row("Pickup", b.pickupAddress)}
  ${row("Dropoff", b.dropoffAddress)}
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
<p style="color:#888;font-size:13px;margin:0 0 20px">Hi ${b.passengerName.split(" ")[0]}, your reservation has been cancelled. Here is a summary.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking", bookingRef)}
  ${row("Route", `${b.pickupAddress} → ${b.dropoffAddress}`)}
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
<p style="color:#888;font-size:13px;margin:0 0 20px">Hi ${b.passengerName.split(" ")[0]}, your Royal Midnight driver is heading to your pickup location now.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking", bookingRef)}
  ${row("Pickup", b.pickupAddress)}
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
<p style="color:#888;font-size:13px;margin:0 0 20px">Hi ${b.passengerName.split(" ")[0]}, your Royal Midnight driver is at your pickup location.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking", bookingRef)}
  ${row("Pickup", b.pickupAddress)}
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

export async function sendTripCompletionEmail(b: BookingEmailData, tipAmount?: number | null) {
  const appUrl = process.env.APP_URL ?? "https://royalmidnight.com";
  const bookingRef = `RM-${String(b.id).padStart(4, "0")}`;
  const total = tipAmount != null && tipAmount > 0
    ? b.priceQuoted + tipAmount
    : b.priceQuoted;
  const html = wrap(`
<h2 style="color:#22c55e;font-size:20px;margin:0 0 8px">Trip Completed</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">Hi ${b.passengerName.split(" ")[0]}, thank you for riding with Royal Midnight. We hope you enjoyed your journey.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking", bookingRef)}
  ${row("Route", `${b.pickupAddress} → ${b.dropoffAddress}`)}
  ${row("Date", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
  ${row("Vehicle", b.vehicleClass === "business" ? "Business Class Sedan" : b.vehicleClass === "suv" ? "Premium SUV" : b.vehicleClass)}
  ${row("Base Fare", `$${b.priceQuoted.toFixed(2)}`)}
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
  Hi ${passengerName.split(" ")[0]}, a Royal Midnight reservation (${bookingRef}) has been created for you.
  Create your account to view your bookings, track your driver, and manage future reservations.
</p>
<p style="margin-top:24px">
  <a href="${signupUrl}" style="background:#c9a84c;color:#050505;padding:12px 28px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px">CREATE MY ACCOUNT</a>
</p>
<p style="margin-top:20px;color:#888;font-size:12px">
  Your email address (${passengerEmail}) is already linked to your booking — just create a password to get started.<br>
  <strong style="color:#c9a84c">Royal Midnight Luxury Transportation</strong>
</p>`);
  await send(passengerEmail, `Your Royal Midnight Reservation is Ready — Create Your Account`, html, "account_invitation");
}

export async function sendStatusChangedAdmin(bookingId: number, oldStatus: string, newStatus: string, passengerName: string) {
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 20px">Booking #${bookingId} Status Changed</h2>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking #", String(bookingId))}
  ${row("Passenger", passengerName)}
  ${row("Previous Status", oldStatus.replace(/_/g, " "))}
  ${row("New Status", newStatus.replace(/_/g, " "))}
</table>`);
  await send(ADMIN_EMAIL, `Booking #${bookingId} → ${newStatus} (${passengerName})`, html, "status_changed_admin");
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

export async function sendTripReminderPassenger(b: ReminderEmailData) {
  const bookingRef = `RM-${String(b.id).padStart(4, "0")}`;
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 8px">Reminder: Your Ride is in 1 Hour</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">Hi ${b.passengerName.split(" ")[0]}, this is a reminder that your Royal Midnight ride is scheduled in approximately one hour. Please be ready at your pickup location.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking #", bookingRef)}
  ${row("Pickup", b.pickupAddress)}
  ${row("Dropoff", b.dropoffAddress)}
  ${row("Date &amp; Time", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
  ${row("Vehicle", b.vehicleClass === "business" ? "Business Class Sedan" : "Premium SUV")}
  ${row("Passengers", String(b.passengers))}
  ${b.driverName ? row("Driver", b.driverName) : ""}
  ${b.driverPhone ? row("Driver Phone", b.driverPhone) : ""}
  ${row("Total Fare", `<span style="color:#c9a84c;font-weight:bold">$${b.priceQuoted.toFixed(2)}</span>`)}
</table>
<p style="margin-top:20px;color:#888;font-size:12px">
  Please ensure you are at the pickup location on time. If you need to reach your driver, use the contact details above.<br>
  <strong style="color:#c9a84c">Royal Midnight Luxury Transportation</strong>
</p>`);
  await send(b.passengerEmail, `Reminder: Your Royal Midnight Ride in 1 Hour — ${bookingRef}`, html, "trip_reminder_passenger");
}

export async function sendTripReminderDriver(b: ReminderEmailData, driverEmail: string) {
  const bookingRef = `RM-${String(b.id).padStart(4, "0")}`;
  const earnings = b.driverEarnings != null ? `$${b.driverEarnings.toFixed(2)}` : "—";
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 8px">Reminder: Upcoming Pickup in 1 Hour</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">This is a reminder that you have a scheduled pickup in approximately one hour. Please review the trip details and be on time.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking #", bookingRef)}
  ${row("Passenger", b.passengerName)}
  ${row("Pickup", b.pickupAddress)}
  ${row("Dropoff", b.dropoffAddress)}
  ${row("Date &amp; Time", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
  ${row("Vehicle", b.vehicleClass === "business" ? "Business Class Sedan" : "Premium SUV")}
  ${row("Passengers", String(b.passengers))}
  ${row("Your Earnings", `<span style="color:#c9a84c;font-weight:bold">${earnings}</span>`)}
</table>
<p style="margin-top:20px;color:#888;font-size:12px">
  Please be at the pickup location promptly at the scheduled time.<br>
  <strong style="color:#c9a84c">Royal Midnight Luxury Transportation</strong>
</p>`);
  await send(driverEmail, `Reminder: Pickup in 1 Hour — ${bookingRef} (${b.passengerName})`, html, "trip_reminder_driver");
}

export async function sendWeeklyDriverPayout(params: {
  driverName: string;
  driverEmail: string;
  weekLabel: string;
  rides: number;
  grossEarnings: number;
  commissionPct: number;
  driverNet: number;
  bankName: string | null;
  routingNumber: string | null;
  accountNumber: string | null;
  legalName: string | null;
}) {
  const {
    driverName, driverEmail, weekLabel, rides,
    grossEarnings, commissionPct, driverNet,
    bankName, routingNumber, accountNumber,
  } = params;

  const commPctDisplay = `${Math.round(commissionPct * 100)}%`;
  const maskAccount = accountNumber ? `****${accountNumber.slice(-4)}` : "Not on file";

  const html = baseHtml(`
<h2 style="color:#c9a84c;font-family:Georgia,serif;margin:0 0 6px">Weekly Earnings Statement</h2>
<p style="color:#9ca3af;margin:0 0 24px;font-size:14px">${weekLabel}</p>
<p style="color:#e8e0d0;">Dear ${driverName},</p>
<p style="color:#9ca3af;line-height:1.6;">Here is your earnings summary for the week of <strong style="color:#e8e0d0">${weekLabel}</strong>.</p>
<table style="width:100%;border-collapse:collapse;margin:20px 0;">
  ${row("Total Rides", String(rides))}
  ${row("Gross Revenue", `$${grossEarnings.toFixed(2)}`)}
  ${row("Your Commission Rate", commPctDisplay)}
  ${row("Your Net Earnings", `<strong style='color:#c9a84c;font-size:18px'>$${driverNet.toFixed(2)}</strong>`)}
</table>
${bankName ? `
<p style="color:#9ca3af;font-size:13px;margin:20px 0 8px;">Payout will be sent to:</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
  ${row("Bank", bankName)}
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
    driverNet: number;
    bankName: string | null;
    routingNumber: string | null;
    accountNumber: string | null;
    legalName: string | null;
  }>;
}) {
  const { weekLabel, commissionPct, totalGross, totalDriverNet, payouts } = params;
  const commPctDisplay = `${Math.round(commissionPct * 100)}%`;
  const companyNet = Math.round((totalGross - totalDriverNet) * 100) / 100;

  const driverRows = payouts.map(p => `
<tr style="border-bottom:1px solid #27272a;">
  <td style="padding:10px 8px;color:#e8e0d0;">${p.driverName}</td>
  <td style="padding:10px 8px;color:#9ca3af;font-size:13px;">${p.driverEmail}</td>
  <td style="padding:10px 8px;text-align:center;color:#e8e0d0;">${p.rides}</td>
  <td style="padding:10px 8px;text-align:right;color:#e8e0d0;">$${p.grossEarnings.toFixed(2)}</td>
  <td style="padding:10px 8px;text-align:right;color:#c9a84c;font-weight:600;">$${p.driverNet.toFixed(2)}</td>
  <td style="padding:10px 8px;color:#9ca3af;font-size:12px;">${p.bankName ?? '<span style="color:#ef4444">Missing</span>'}</td>
  <td style="padding:10px 8px;color:#9ca3af;font-size:12px;font-family:monospace;">${p.routingNumber ?? '—'}</td>
  <td style="padding:10px 8px;color:#9ca3af;font-size:12px;font-family:monospace;">${p.accountNumber ? `****${p.accountNumber.slice(-4)}` : '—'}</td>
</tr>`).join("");

  const html = baseHtml(`
<h2 style="color:#c9a84c;font-family:Georgia,serif;margin:0 0 6px">Weekly Payout Report</h2>
<p style="color:#9ca3af;margin:0 0 24px;font-size:14px">${weekLabel} — For Admin Review</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
  ${row("Week", weekLabel)}
  ${row("Total Gross Revenue", `$${totalGross.toFixed(2)}`)}
  ${row("Total Driver Payouts (${commPctDisplay})", `$${totalDriverNet.toFixed(2)}`)}
  ${row("Company Net", `<strong style='color:#22c55e'>$${companyNet.toFixed(2)}</strong>`)}
</table>
<h3 style="color:#c9a84c;margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:0.1em;">Driver Breakdown</h3>
<div style="overflow-x:auto;">
<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead>
    <tr style="border-bottom:1px solid #3f3f46;background:#18181b;">
      <th style="padding:8px;text-align:left;color:#9ca3af;text-transform:uppercase;font-size:11px;letter-spacing:0.05em;">Driver</th>
      <th style="padding:8px;text-align:left;color:#9ca3af;text-transform:uppercase;font-size:11px;">Email</th>
      <th style="padding:8px;text-align:center;color:#9ca3af;text-transform:uppercase;font-size:11px;">Rides</th>
      <th style="padding:8px;text-align:right;color:#9ca3af;text-transform:uppercase;font-size:11px;">Gross</th>
      <th style="padding:8px;text-align:right;color:#9ca3af;text-transform:uppercase;font-size:11px;">Net to Driver</th>
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
<p style="color:#e5e7eb;font-size:15px;margin:0 0 16px">Hello ${passengerName},</p>
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
