import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? "587");
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM ?? "Royal Midnight <noreply@royalmidnight.com>";
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@royalmidnight.com";

function isConfigured() {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function createTransport() {
  if (!isConfigured()) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function send(to: string | string[], subject: string, html: string) {
  const transport = createTransport();
  if (!transport) {
    console.log(`[mailer] SMTP not configured — would send to ${Array.isArray(to) ? to.join(", ") : to}: ${subject}`);
    return;
  }
  try {
    await transport.sendMail({ from: SMTP_FROM, to, subject, html });
  } catch (err) {
    console.error("[mailer] Failed to send email:", err);
  }
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
  await send(b.passengerEmail, `Booking Confirmed — Royal Midnight #${b.id}`, html);
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
  await send(ADMIN_EMAIL, `New Booking #${b.id} — ${b.passengerName}`, html);
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
  await send(driverEmails, `New Ride Available — Booking #${b.id}`, html);
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
  await send(ADMIN_EMAIL, `Booking #${b.id} Cancelled — ${b.passengerName}`, html);
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
  await send(ADMIN_EMAIL, `Driver Accepted — Booking #${b.id} (${driverName})`, html);
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
  await send(ADMIN_EMAIL, `Driver Unassigned — Booking #${bookingId}`, html);
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
  await send(ADMIN_EMAIL, `Booking #${bookingId} → ${newStatus} (${passengerName})`, html);
}
