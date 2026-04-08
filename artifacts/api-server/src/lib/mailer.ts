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
<div style="border-bottom:1px solid #c9a84c;padding-bottom:16px;margin-bottom:24px">
  <span style="font-family:Georgia,serif;font-size:22px;font-weight:bold;letter-spacing:2px;color:#e8e0d0">ROYAL </span>
  <span style="font-family:Georgia,serif;font-size:22px;font-style:italic;color:#c9a84c">MIDNIGHT</span>
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
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 8px">Booking Confirmed</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">Thank you for choosing Royal Midnight. Your reservation is confirmed and our team will be in touch shortly.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking #", String(b.id))}
  ${row("Pickup", b.pickupAddress)}
  ${row("Dropoff", b.dropoffAddress)}
  ${row("Date &amp; Time", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }))}
  ${row("Vehicle", b.vehicleClass === "business" ? "Business Class Sedan" : "Premium SUV")}
  ${row("Passengers", String(b.passengers))}
  ${row("Total Fare", `<span style="color:#c9a84c;font-weight:bold">$${b.priceQuoted.toFixed(2)}</span>`)}
  ${b.flightNumber ? row("Flight", b.flightNumber) : ""}
  ${b.specialRequests ? row("Special Requests", b.specialRequests) : ""}
</table>
<p style="margin-top:24px;color:#888;font-size:12px">
  Questions? Reply to this email or contact our support team.<br>
  <strong style="color:#c9a84c">Royal Midnight Luxury Transportation</strong>
</p>`);
  await send(b.passengerEmail, `Booking Confirmed — Royal Midnight #${b.id}`, html, "booking_confirmation_passenger");
}

export async function sendNewBookingAdmin(b: BookingEmailData) {
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 20px">New Booking #${b.id}</h2>
<table style="width:100%;border-collapse:collapse">
  ${row("Passenger", b.passengerName)}
  ${row("Email", b.passengerEmail)}
  ${row("Pickup", b.pickupAddress)}
  ${row("Dropoff", b.dropoffAddress)}
  ${row("Date &amp; Time", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York" }))}
  ${row("Vehicle", b.vehicleClass === "business" ? "Business Class Sedan" : "Premium SUV")}
  ${row("Passengers", String(b.passengers))}
  ${row("Total Fare", `$${b.priceQuoted.toFixed(2)}`)}
  ${b.flightNumber ? row("Flight", b.flightNumber) : ""}
  ${b.specialRequests ? row("Requests", b.specialRequests) : ""}
</table>`);
  await send(ADMIN_EMAIL, `New Booking #${b.id} — ${b.passengerName}`, html, "new_booking_admin");
}

export async function sendNewBookingAvailableToDrivers(b: BookingEmailData, driverEmails: string[]) {
  if (driverEmails.length === 0) return;
  const earnings = b.driverEarnings != null ? `$${b.driverEarnings.toFixed(2)}` : "—";
  const html = wrap(`
<h2 style="color:#c9a84c;font-size:20px;margin:0 0 8px">New Ride Available</h2>
<p style="color:#888;font-size:13px;margin:0 0 20px">A new booking is ready to accept. Log in to the driver portal to claim it.</p>
<table style="width:100%;border-collapse:collapse">
  ${row("Booking #", String(b.id))}
  ${row("Pickup", b.pickupAddress)}
  ${row("Dropoff", b.dropoffAddress)}
  ${row("Date &amp; Time", new Date(b.pickupAt).toLocaleString("en-US", { timeZone: "America/New_York" }))}
  ${row("Vehicle", b.vehicleClass === "business" ? "Business Class Sedan" : "Premium SUV")}
  ${row("Your Earnings", `<span style="color:#c9a84c;font-weight:bold">${earnings}</span>`)}
  ${b.flightNumber ? row("Flight", b.flightNumber) : ""}
  ${b.specialRequests ? row("Special Requests", b.specialRequests) : ""}
</table>
<p style="margin-top:24px"><a href="${process.env.APP_URL ?? "https://royalmidnight.com"}/driver/dashboard" style="background:#c9a84c;color:#050505;padding:10px 24px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px">ACCEPT RIDE</a></p>`);
  await send(driverEmails, `New Ride Available — Booking #${b.id}`, html, "new_booking_drivers");
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
