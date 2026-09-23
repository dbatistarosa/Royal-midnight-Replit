import { settleBookingCancellation } from "../lib/cancellationSettlement.js";
import { recordSupplementalPayment } from "../lib/supplementalPayments.js";
import { withMailScope } from "../lib/mailOutbox.js";
import { withLock, rows, bookingAction, setActor } from "../lib/durability.js";
import { enqueueBookingNotification } from "../lib/bookingJobs.js";
import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import Stripe from "stripe";
import { db } from "@workspace/db";
import {
  bookingsTable as bookings,
  driversTable,
  settingsTable,
  usersTable,
} from "@workspace/db/schema";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import {
  sendBookingConfirmationPassenger,
  sendNewBookingAdmin,
  sendNewBookingAvailableToDrivers,
  sendInvoiceToPassenger,
  getMailerStatus,
} from "../lib/mailer.js";
import { sendBookingConfirmationSms } from "../lib/sms.js";
import { sendNewRideOfferPush } from "../lib/push.js";
import { requireAdmin, requireAuth, optionalAuth } from "../middleware/auth.js";
import { encryptField, isEncryptedField, safeDecryptField } from "../lib/encrypt.js";
import { sendStripeError } from "../lib/stripeError.js";
import {
  isMissingCustomerError,
  forgetStaleStripeCustomer,
} from "../lib/stripeCustomer.js";
import {
  fetchCommissionPct,
  driverEarningsForBooking,
} from "../lib/commission.js";
import { paymentLimiter } from "../lib/rateLimit.js";
import { logger } from "../lib/logger.js";
import { releasePromoUsage } from "./promos.js";
import { createBookingCustomerSession } from "../lib/paymentCustomerSession.js";

const router: IRouter = Router();

/** Constant-time comparison of a caller-supplied tracking token against the one
 *  stored on the booking. */
function matchesTrackingToken(
  stored: string | null | undefined,
  provided: unknown,
): boolean {
  if (typeof stored !== "string" || !stored) return false;
  if (typeof provided !== "string" || provided.length !== stored.length)
    return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided, "utf8"),
      Buffer.from(stored, "utf8"),
    );
  } catch {
    return false;
  }
}

const APP_URL = process.env.APP_URL ?? "https://royalmidnight.com";

/**
 * Where Stripe delivers events.
 *
 * Deliberately NOT derived from APP_URL. Stripe does not follow redirects on
 * webhook deliveries: a 3xx is recorded as a failed delivery, and enough
 * consecutive failures disable the endpoint. royalmidnight.com answers
 * `308 Permanent Redirect` to www.royalmidnight.com, so a webhook registered on
 * the bare domain never actually arrives — while every manual check of that URL
 * in a browser looks perfectly fine, because browsers do follow redirects.
 *
 * APP_URL is shared with the links in outgoing email, where a redirect costs
 * nothing, so it stays as it is; only this one needs the canonical host.
 */
const WEBHOOK_URL =
  process.env.STRIPE_WEBHOOK_URL ??
  "https://www.royalmidnight.com/api/webhook/stripe";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2024-06-20" as const,timeout:10000,maxNetworkRetries:1 });
}

async function getWebhookSecret(): Promise<string | null> {
  // Prefer explicit env var (most secure)
  if (process.env.STRIPE_WEBHOOK_SECRET)
    return process.env.STRIPE_WEBHOOK_SECRET;
  // Fall back to DB-persisted secret (set during auto-registration). Stored
  // encrypted since it authenticates Stripe's callbacks; safeDecryptField also
  // passes through rows written before that change.
  const [row] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "stripe_webhook_secret"))
    .limit(1);
  const secret = safeDecryptField(row?.value) ?? null;
  if (secret && row?.value && !isEncryptedField(row.value)) {
    await db
      .update(settingsTable)
      .set({ value: encryptField(secret), updatedAt: new Date() })
      .where(eq(settingsTable.key, "stripe_webhook_secret"));
  }
  return secret;
}

/** Third copy of this lookup, folded into the shared one. */
const getCommissionPct = fetchCommissionPct;

function parseTipCents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) && cents >= 100 && cents <= 50000
    ? cents
    : null;
}

function tipMetadataMatches(
  intent: Stripe.PaymentIntent,
  bookingId: number,
  userId: number,
): boolean {
  return (
    intent.metadata.bookingId === String(bookingId) &&
    intent.metadata.type === "tip" &&
    intent.metadata.userId === String(userId)
  );
}

function tipDollars(cents: number): number {
  return cents / 100;
}

export async function firePostPaymentEmails(bookingId: number): Promise<void> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId));
  if (!booking || !["pending","authorized","confirmed","on_way","on_location","in_progress","completed"].includes(booking.status)) return;

  const commissionPct = await getCommissionPct();
  const priceQuoted = parseFloat(String(booking.priceQuoted));
  // Commission base: pre-tax/pre-fee/pre-discount subtotal, falls back to priceQuoted
  // for legacy rows — see fareSubtotal column comment in lib/db/src/schema/bookings.ts.
  const fareSubtotal =
    booking.fareSubtotal != null
      ? parseFloat(String(booking.fareSubtotal))
      : priceQuoted;
  const emailData = {
    id: booking.id,
    passengerName: booking.passengerName,
    passengerEmail: booking.passengerEmail,
    pickupAddress: booking.pickupAddress,
    dropoffAddress: booking.dropoffAddress,
    pickupAt: booking.pickupAt.toISOString(),
    vehicleClass: booking.vehicleClass ?? "business",
    passengers: booking.passengers ?? 1,
    priceQuoted,
    // Commission plus the add-ons the chauffeur keeps in full, so the offer
    // email and push match the figure their app shows for the same trip.
    driverEarnings: await driverEarningsForBooking(
      booking.id,
      fareSubtotal,
      commissionPct,
    ),
    flightNumber: booking.flightNumber ?? null,
    specialRequests: booking.specialRequests ?? null,
  };

  const approvedDrivers = await db
    .select({ email: usersTable.email })
    .from(driversTable)
    .innerJoin(usersTable, eq(driversTable.userId, usersTable.id))
    .where(eq(driversTable.approvalStatus, "approved"));
  const driverEmails = approvedDrivers
    .map((d) => d.email)
    .filter(Boolean) as string[];

  // Narrower than the email fan-out above: only drivers who can actually act
  // on the offer right now get a push (online, available, not on hold).
  const pushableDrivers = await db
    .select({
      pushToken: driversTable.pushToken,
      pushPlatform: driversTable.pushPlatform,
    })
    .from(driversTable)
    .where(
      and(
        eq(driversTable.status, "available"),
        eq(driversTable.complianceHold, false),
      ),
    );

  const bookingRef = `RM-${String(bookingId).padStart(4, "0")}`;

  await Promise.all([
    sendBookingConfirmationPassenger(emailData),
    sendNewBookingAdmin(emailData),
    sendNewBookingAvailableToDrivers(emailData, driverEmails),
    sendNewRideOfferPush(pushableDrivers, {
      id: booking.id,
      pickupAddress: booking.pickupAddress,
      driverEarnings: emailData.driverEarnings,
    }),
    // SMS confirmation — non-fatal; passenger phone may be absent
    sendBookingConfirmationSms(
      booking.passengerPhone,
      bookingRef,
      booking.pickupAt.toISOString(),
      booking.pickupAddress,
    ).catch((err) =>
      console.error("[payments] booking confirmation SMS failed:", err),
    ),
  ]);
}

// ─── Public endpoints ───────────────────────────────────────────────────────

router.get("/payments/config", async (_req, res): Promise<void> => {
  // Trim: a stray newline or space in the dashboard env var produces a key that
  // looks correct in logs but makes Stripe.js reject Elements silently — the
  // payment form then spins on "Loading payment form…" forever with no error.
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  if (!publishableKey) {
    res.status(503).json({ error: "Stripe not configured" });
    return;
  }
  if (!/^pk_(test|live)_[A-Za-z0-9]+$/.test(publishableKey)) {
    console.error(
      "[payments] STRIPE_PUBLISHABLE_KEY is malformed — Elements will not mount",
    );
    res
      .status(503)
      .json({
        error:
          "Stripe publishable key is malformed. Check STRIPE_PUBLISHABLE_KEY.",
      });
    return;
  }

  // The two keys must be the same mode, and in practice the same account.
  // When they are not, everything looks healthy right up to the payment step:
  // the server creates a PaymentIntent perfectly well in ITS account, and then
  // Stripe.js in the browser reports "The client_secret provided does not match
  // any associated PaymentIntent on this account" — a message that points at
  // the code rather than at the configuration that actually caused it. Failing
  // here instead names the real problem before the customer ever sees a form.
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const publishableMode = publishableKey.startsWith("pk_live_")
    ? "live"
    : "test";
  const secretMode =
    secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_")
      ? "live"
      : "test";
  if (secretKey && publishableMode !== secretMode) {
    console.error(
      `[payments] Stripe key mode mismatch: publishable is ${publishableMode}, secret is ${secretMode}. ` +
        `Payments cannot complete until both come from the same Stripe account and mode.`,
    );
    res.status(503).json({
      error: `Stripe is misconfigured: the publishable key is ${publishableMode} mode but the secret key is ${secretMode} mode. Both must come from the same Stripe account.`,
    });
    return;
  }

  res.json({ publishableKey });
});

router.post('/payments/create-intent',paymentLimiter(),optionalAuth,async(req,res):Promise<void>=>{
 const bId=Number(req.body?.bookingId);
 if(!Number.isInteger(bId)||bId<=0){res.status(400).json({error:'Valid bookingId required'});return;}
 try{
  const result=await withLock('payment:'+bId,async tx=>{
   const stripe=getStripe();
   const [booking]=await tx.select().from(bookings).where(eq(bookings.id,bId));
   if(!booking)return {status:404,body:{error:'Booking not found'}};
   const caller=req.currentUser;
   let authorized=caller?.role==='admin'||(!!caller && booking.userId===caller.userId)||matchesTrackingToken(booking.trackingToken,req.body?.trackingToken);
   if(!authorized && caller){
    const [u]=rows<{email:string}>(await tx.execute(sql`SELECT email FROM users WHERE id=${caller.userId} AND email_verified_at IS NOT NULL`));
    authorized=!!u && booking.userId==null && u.email===booking.passengerEmail;
   }
   if(!authorized)return {status:403,body:{error:'Access denied'}};
   if(booking.status!=='awaiting_payment')return {status:409,body:{error:'This booking is not awaiting payment'}};
   const [invoiceRow]=rows<{stripe_invoice_id:string|null}>(await tx.execute(sql`SELECT stripe_invoice_id FROM bookings WHERE id=${bId}`));
   if(invoiceRow?.stripe_invoice_id){
    const invoice=await stripe.invoices.retrieve(invoiceRow.stripe_invoice_id);
    if(invoice.status!=='void'&&invoice.status!=='uncollectible')return {status:409,body:{error:'Use the invoice payment link for this reservation'}};
   }
   const amount=Math.round(Number(booking.priceQuoted)*100);
   if(!Number.isSafeInteger(amount)||amount<50)return {status:400,body:{error:'Invalid payable amount'}};
   let previous:Stripe.PaymentIntent|null=null;
   if(booking.stripePaymentIntentId){
    // Do not create another charge when retrieval fails: the previous charge may exist.
    previous=await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
    if(['succeeded','processing','requires_capture'].includes(previous.status)){
     if(previous.status==='succeeded'){
      await tx.update(bookings).set({status:'pending'}).where(and(eq(bookings.id,bId),eq(bookings.status,'awaiting_payment')));
      await enqueueBookingNotification(bId,tx);
     }
     return {status:409,body:{error:'Payment already received or processing. Refresh your reservation.'}};
    }
    if(previous.status!=='canceled' && !(previous.amount===amount && previous.currency==='usd'))
      await stripe.paymentIntents.cancel(previous.id,{}, {idempotencyKey:'cancel-repriced-'+previous.id});
   }
   // The person who pays owns the reusable card. For an executive assistant
   // booking for a managed traveler that is booked_by_user_id; for the normal
   // and just-created-account paths it remains the passenger account.
   const paymentAccountUserId=caller && booking.bookedByUserId===caller.userId
    ? caller.userId : booking.userId;
   let customerId:string|undefined;
   if(paymentAccountUserId){
    const [user]=await tx.select().from(usersTable).where(eq(usersTable.id,paymentAccountUserId));
    if(user){
     customerId=user.stripeCustomerId??undefined;
     const staleId=customerId;
     if(customerId){try{const customer=await stripe.customers.retrieve(customerId);if(customer.deleted)customerId=undefined;}
       catch(err){if(isMissingCustomerError(err))customerId=undefined;else throw err;}}
     if(!customerId){
      const customer=await stripe.customers.create({email:user.email,name:user.name,metadata:{userId:String(user.id)}},{idempotencyKey:'customer-user-'+user.id+'-'+(staleId??'initial')});
      customerId=customer.id;await tx.update(usersTable).set({stripeCustomerId:customerId}).where(eq(usersTable.id,user.id));
     }
    }
   }
   const customerSessionClientSecret=await createBookingCustomerSession(stripe,{
    customerId,paymentAccountUserId,callerUserId:caller?.userId,
   });
   if(previous && previous.amount===amount && previous.currency==='usd' && previous.status!=='canceled')
    return {status:200,body:{clientSecret:previous.client_secret,paymentIntentId:previous.id,customerSessionClientSecret}};
   const intent=await stripe.paymentIntents.create({amount,currency:'usd',capture_method:'automatic',
     automatic_payment_methods:{enabled:true,allow_redirects:'never'},
     metadata:{bookingId:String(bId),paymentAccountUserId:String(paymentAccountUserId??'')},description:'Royal Midnight — Reservation '+bId,
     ...(customerId?{customer:customerId,setup_future_usage:'off_session' as const}:{})},
     {idempotencyKey:'booking-'+bId+'-amount-'+amount+'-after-'+(previous?.id??'initial')});
   await tx.update(bookings).set({stripePaymentIntentId:intent.id,updatedAt:new Date()}).where(eq(bookings.id,bId));
   return {status:200,body:{clientSecret:intent.client_secret,paymentIntentId:intent.id,customerSessionClientSecret}};
  });
  res.status(result.status).json(result.body);
 }catch(err){sendStripeError(req,res,err,'Unable to initialize payment. Please retry.');}
});

// Lookup which booking a PaymentIntent belongs to (via PI metadata) — used by
// the frontend 3DS recovery path when sessionStorage is unavailable.
router.get(
  "/payments/find-booking",
  optionalAuth,
  paymentLimiter(),
  async (req, res): Promise<void> => {
  const { paymentIntentId } = req.query as { paymentIntentId?: string };
  if (!paymentIntentId || !/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) {
    res.status(400).json({ error: "paymentIntentId is required" });
    return;
  }
  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const bId = parseInt(intent.metadata.bookingId || "0", 10);
    if (!bId) {
      res
        .status(404)
        .json({ error: "No booking linked to this PaymentIntent" });
      return;
    }
    const [booking] = await db
      .select({
        userId: bookings.userId,
        bookedByUserId: bookings.bookedByUserId,
        trackingToken: bookings.trackingToken,
      })
      .from(bookings)
      .where(eq(bookings.id, bId));
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    const trackingToken = req.headers["x-booking-tracking-token"];
    const caller = req.currentUser;
    const callerOwnsBooking =
      !!caller &&
      (caller.role === "admin" ||
        booking.userId === caller.userId ||
        booking.bookedByUserId === caller.userId);
    const tokenOwnsBooking = matchesTrackingToken(
      booking.trackingToken,
      Array.isArray(trackingToken) ? trackingToken[0] : trackingToken,
    );
    if (!callerOwnsBooking && !tokenOwnsBooking) {
      res.status(403).json({ error: "Payment does not belong to this caller" });
      return;
    }
    res.set("Cache-Control", "no-store");
    res.json({ bookingId: bId, trackingToken: booking.trackingToken ?? null });
  } catch (err: any) {
    sendStripeError(req, res, err);
  }
  },
);

// Retrieve the client_secret and status for an existing PaymentIntent — used by
// admin "Charge Card" to reuse a PI created in a previous attempt instead of
// creating a duplicate.
router.get(
  "/payments/intent/:piId/client-secret",
  requireAdmin,
  async (req, res): Promise<void> => {
    const piId = String(req.params["piId"] ?? "");
    if (!piId) {
      res.status(400).json({ error: "piId is required" });
      return;
    }
    try {
      const stripe = getStripe();
      const intent = await stripe.paymentIntents.retrieve(piId);
      if (!intent.client_secret) {
        res
          .status(404)
          .json({ error: "No client secret available for this intent" });
        return;
      }
      res.json({ clientSecret: intent.client_secret, status: intent.status });
    } catch (err: any) {
      const isNotFound =
        err?.statusCode === 404 || err?.code === "resource_missing";
      if (isNotFound) {
        res.status(404).json({ error: "PaymentIntent not found in Stripe" });
      } else {
        sendStripeError(req, res, err);
      }
    }
  },
);

router.post('/payments/confirm/:bookingId',paymentLimiter(),async(req,res):Promise<void>=>{
 const bId=Number(req.params.bookingId),intentId=req.body?.paymentIntentId;
 if(!Number.isInteger(bId)||bId<1||typeof intentId!=='string'){res.status(400).json({error:'Valid booking and payment required'});return;}
 try{
  const result=await withLock('payment:'+bId,async()=>{
   const intent=await getStripe().paymentIntents.retrieve(intentId);
   const [booking]=await db.select().from(bookings).where(eq(bookings.id,bId));
   if(!booking)return {status:404,body:{error:'Booking not found'}};
   if(booking.stripePaymentIntentId!==intent.id || intent.metadata.bookingId!==String(bId))return {status:403,body:{error:'Payment does not belong to this booking'}};
   if(intent.currency!=='usd'||intent.amount<Math.round(Number(booking.priceQuoted)*100))return {status:402,body:{error:'Payment does not cover this booking'}};
   if(intent.status==='succeeded'){await confirmBookingFromPaymentIntent(bId,intent.id);await enqueueBookingNotification(bId);}
   else if(intent.status==='requires_capture')await authorizeBookingFromPaymentIntent(bId,intent.id);
   else if(intent.status!=='processing')return {status:400,body:{error:'Payment not completed',status:intent.status}};
   const [updated]=await db.select({status:bookings.status}).from(bookings).where(eq(bookings.id,bId));
   return {status:200,body:{success:true,status:updated.status,paymentIntentId:intent.id,paymentStatus:intent.status}};
  });res.status(result.status).json(result.body);
 }catch(err){sendStripeError(req,res,err);}
});

// ─── Admin: manual payment confirmation for stuck awaiting_payment bookings ──

router.post(
  "/admin/payments/check/:bookingId",
  requireAdmin,
  async (req, res): Promise<void> => {
    const bId = parseInt(String(req.params["bookingId"] ?? ""), 10);
    if (!bId) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id,bId));
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    if(booking.status==="cancelled"){res.status(409).json({error:"Booking was cancelled"});return;}
    // If already paid/confirmed, return success immediately
    if (booking.status !== "awaiting_payment") {
      res.json({
        confirmed: true,
        alreadyPaid: true,
        message: `Booking is already confirmed (status: ${booking.status}).`,
        paymentIntentId: booking.stripePaymentIntentId ?? undefined,
      });
      return;
    }

    try {
      const stripe = getStripe();

      // 1. Check PaymentIntents with bookingId metadata (card payment flow)
      const intents = await stripe.paymentIntents.search({
        query: `metadata["bookingId"]:"${bId}"`,
        limit: 5,
      });
      const succeededIntent = intents.data.find(
        (pi) => pi.status === "succeeded" && pi.currency === "usd" && pi.amount_received >= Math.round(Number(booking.priceQuoted)*100),
      );
      if (succeededIntent) {
        await db
          .update(bookings)
          .set({
            status: "pending",
            stripePaymentIntentId: succeededIntent.id,
            updatedAt: new Date(),
          })
          .where(and(eq(bookings.id, bId),eq(bookings.status,"awaiting_payment")));
        await enqueueBookingNotification(bId);
        res.json({
          confirmed: true,
          source: "payment_intent",
          paymentIntentId: succeededIntent.id,
          message: "Payment confirmed — booking moved to pending.",
        });
        return;
      }

      // 2. Check Stripe invoices with bookingId metadata (send-invoice flow)
      const invoiceSearch = await stripe.invoices.search({
        query: `metadata["bookingId"]:"${bId}"`,
        limit: 5,
      });
      const paidInvoice = invoiceSearch.data.find(
        (inv) => inv.status === "paid" && inv.currency === "usd" && inv.amount_paid >= Math.round(Number(booking.priceQuoted)*100),
      );
      if (paidInvoice) {
        await db
          .update(bookings)
          .set({ status: "pending", updatedAt: new Date() })
          .where(and(eq(bookings.id, bId),eq(bookings.status,"awaiting_payment")));
        await enqueueBookingNotification(bId);
        res.json({
          confirmed: true,
          source: "invoice",
          invoiceId: paidInvoice.id,
          message: "Invoice payment confirmed — booking moved to pending.",
        });
        return;
      }

      const intentStatuses =
        intents.data.map((pi) => pi.status).join(", ") || "none";
      const invoiceStatuses =
        invoiceSearch.data.map((inv) => inv.status).join(", ") || "none";
      res.json({
        confirmed: false,
        message: `No successful payment found. PaymentIntents: ${intentStatuses}. Invoices: ${invoiceStatuses}.`,
      });
    } catch (err: any) {
      sendStripeError(req, res, err);
    }
  },
);

// ─── Admin: Stripe webhook management ───────────────────────────────────────

router.get(
  "/admin/stripe/webhook-status",
  requireAdmin,
  async (req, res): Promise<void> => {
    const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
    const webhookSecretInEnv = !!process.env.STRIPE_WEBHOOK_SECRET;
    const mailerStatus = getMailerStatus();

    // Check DB fallback for webhook secret
    const dbSecret = await db
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, "stripe_webhook_secret"))
      .limit(1)
      .then((rows) => rows[0]?.value ?? null);

    const webhookSecretSet = webhookSecretInEnv || !!dbSecret;
    const webhookSecretSource = webhookSecretInEnv
      ? "env"
      : dbSecret
        ? "db"
        : "none";

    if (!stripeConfigured) {
      res.json({
        stripeConfigured: false,
        webhookSecretSet: false,
        webhookSecretSource,
        webhooks: [],
        expectedUrl: WEBHOOK_URL,
        mailer: mailerStatus,
      });
      return;
    }

    try {
      const stripe = getStripe();
      const webhookList = await stripe.webhookEndpoints.list({ limit: 20 });
      const webhooks = webhookList.data.map((w) => ({
        id: w.id,
        url: w.url,
        status: w.status,
        enabledEvents: w.enabled_events,
        isOurs: w.url === WEBHOOK_URL,
      }));
      const isRegistered = webhooks.some(
        (w) => w.isOurs && w.status === "enabled",
      );
      res.json({
        stripeConfigured: true,
        webhookSecretSet,
        webhookSecretSource,
        webhooks,
        expectedUrl: WEBHOOK_URL,
        isRegistered,
        mailer: mailerStatus,
      });
    } catch (err: any) {
      sendStripeError(req, res, err);
    }
  },
);

router.post(
  "/admin/stripe/register-webhook",
  requireAdmin,
  async (req, res): Promise<void> => {
    if (!process.env.STRIPE_SECRET_KEY) {
      res.status(503).json({ error: "STRIPE_SECRET_KEY is not configured" });
      return;
    }
    try {
      const stripe = getStripe();

      const REQUIRED_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] =
        [
          "payment_intent.created",
          "payment_intent.amount_capturable_updated",
          "payment_intent.succeeded",
          "payment_intent.payment_failed",
          "charge.succeeded",
          "charge.updated",
          "charge.refunded",
          "charge.dispute.created",
          "charge.dispute.closed",
          "invoice.paid",
        ];
      const existing = await stripe.webhookEndpoints.list({ limit: 20 });
      const alreadyExists = existing.data.find((w) => w.url === WEBHOOK_URL);
      if (alreadyExists) {
        // Ensure the existing webhook has all required events
        const currentEvents = alreadyExists.enabled_events ?? [];
        const missingEvents = REQUIRED_EVENTS.filter(
          (e) => !currentEvents.includes(e),
        );
        if (missingEvents.length > 0) {
          const mergedEvents = Array.from(
            new Set([...currentEvents, ...REQUIRED_EVENTS]),
          ) as Stripe.WebhookEndpointUpdateParams.EnabledEvent[];
          await stripe.webhookEndpoints.update(alreadyExists.id, {
            enabled_events: mergedEvents,
          });
        }
        res.json({
          alreadyExists: true,
          webhookId: alreadyExists.id,
          url: alreadyExists.url,
          eventsUpdated: missingEvents.length > 0,
          addedEvents: missingEvents,
          message:
            missingEvents.length > 0
              ? `Webhook events updated to include: ${missingEvents.join(", ")}. The signing secret was set when it was first created.`
              : "Webhook already registered with all required events. The signing secret was set when it was first created — update STRIPE_WEBHOOK_SECRET if needed.",
        });
        return;
      }

      const webhook = await stripe.webhookEndpoints.create({
        url: WEBHOOK_URL,
        enabled_events: [
          "payment_intent.created",
          "payment_intent.amount_capturable_updated",
          "payment_intent.succeeded",
          "payment_intent.payment_failed",
          "charge.succeeded",
          "charge.updated",
          "charge.refunded",
          "charge.dispute.created",
          "charge.dispute.closed",
          "invoice.paid",
        ],
        description: "Royal Midnight payment confirmation webhook",
      });

      // Persist signing secret to DB so webhook handler works immediately (even
      // before env var is set). Encrypted at rest: the settings table is read
      // whole by the admin panel, and this value is what authenticates Stripe's
      // callbacks. GET /admin/settings redacts it; this stops it being readable
      // from a database dump too.
      if (webhook.secret) {
        const stored = encryptField(webhook.secret);
        await db
          .insert(settingsTable)
          .values({ key: "stripe_webhook_secret", value: stored })
          .onConflictDoUpdate({
            target: settingsTable.key,
            set: { value: stored },
          });
      }

      res.json({
        alreadyExists: false,
        webhookId: webhook.id,
        url: webhook.url,
        signingSecret: webhook.secret,
        message:
          "Webhook registered successfully. The signing secret has been saved and is active. Optionally set it as STRIPE_WEBHOOK_SECRET in your environment for extra security.",
      });
    } catch (err: any) {
      sendStripeError(req, res, err);
    }
  },
);

// ─── Admin: ensure existing webhook has required events subscribed
router.post(
  "/admin/stripe/ensure-webhook-events",
  requireAdmin,
  async (req, res): Promise<void> => {
    if (!process.env.STRIPE_SECRET_KEY) {
      res.status(503).json({ error: "STRIPE_SECRET_KEY is not configured" });
      return;
    }
    const REQUIRED_EVENTS: Stripe.WebhookEndpointUpdateParams.EnabledEvent[] = [
      "payment_intent.created",
      "payment_intent.amount_capturable_updated",
      "payment_intent.succeeded",
      "payment_intent.payment_failed",
      "charge.succeeded",
      "charge.updated",
      "charge.refunded",
      "charge.dispute.created",
          "charge.dispute.closed",
      "invoice.paid",
    ];
    try {
      const stripe = getStripe();
      const existing = await stripe.webhookEndpoints.list({ limit: 20 });
      const ours = existing.data.find((w) => w.url === WEBHOOK_URL);
      if (!ours) {
        res.json({
          updated: false,
          message: "No webhook registered yet. Use register-webhook first.",
        });
        return;
      }
      const currentEvents = ours.enabled_events ?? [];
      const missingEvents = REQUIRED_EVENTS.filter(
        (e) => !currentEvents.includes(e),
      );
      if (missingEvents.length === 0) {
        res.json({
          updated: false,
          webhookId: ours.id,
          enabledEvents: currentEvents,
          message: "All required events already subscribed.",
        });
        return;
      }
      // Merge existing events with required ones
      const mergedEvents = Array.from(
        new Set([...currentEvents, ...REQUIRED_EVENTS]),
      ) as Stripe.WebhookEndpointUpdateParams.EnabledEvent[];
      const updated = await stripe.webhookEndpoints.update(ours.id, {
        enabled_events: mergedEvents,
      });
      res.json({
        updated: true,
        webhookId: updated.id,
        enabledEvents: updated.enabled_events,
        addedEvents: missingEvents,
        message: "Webhook events updated to include all required events.",
      });
    } catch (err: any) {
      sendStripeError(req, res, err);
    }
  },
);

// ─── Admin: cancel a Stripe authorization (manual-capture PI) and release the hold

router.post('/admin/payments/cancel-auth/:bookingId',requireAdmin,bookingAction(async(req,res,_next,tx):Promise<void>=>{
 const id=Number(req.params.bookingId);
 if(!Number.isInteger(id)||id<1){res.status(400).json({error:'Invalid booking id'});return;}
 await setActor(tx,req.currentUser!.userId);
 const [booking]=await tx.select().from(bookings).where(eq(bookings.id,id));
 if(!booking){res.status(404).json({error:'Booking not found'});return;}
 if(booking.status!=='authorized'){res.status(409).json({error:'Booking is not authorized'});return;}
 const [updated]=await tx.update(bookings).set({status:'cancelled',cancelledAt:new Date(),cancelledBy:'admin',updatedAt:new Date()}).where(and(eq(bookings.id,id),eq(bookings.status,'authorized'))).returning({id:bookings.id});
 if(!updated){res.status(409).json({error:'Booking changed before cancellation'});return;}
 if(booking.promoCode)await tx.execute(sql`UPDATE promo_codes SET used_count=GREATEST(0,used_count-1) WHERE lower(code)=lower(${booking.promoCode})`);
 const payload={intentId:booking.stripePaymentIntentId,refundCents:Math.round(Number(booking.priceQuoted)*100),feeAmount:0};
 await tx.execute(sql`INSERT INTO app_jobs(key,kind,booking_id,payload) VALUES(${'booking-cancellation:'+id},'booking-cancellation',${id},${JSON.stringify(payload)}::jsonb) ON CONFLICT DO NOTHING`);
 res.status(200).json({success:true,message:'Cancellation recorded; card settlement is queued.',settlementStatus:'queued'});
}));

// ─── Admin: send a Stripe Invoice to the passenger's email for manual bookings

router.post('/payments/create-invoice/:bookingId',requireAdmin,async(req,res):Promise<void>=>{
 const bId=Number(req.params.bookingId);
 if(!Number.isInteger(bId)||bId<1){res.status(400).json({error:'Invalid booking id'});return;}
 try{
  const result=await withLock('payment:'+bId,async()=>{
   const [booking]=await db.select().from(bookings).where(eq(bookings.id,bId));
   if(!booking)return {status:404,body:{error:'Booking not found'}};
   if(booking.status!=='awaiting_payment')return {status:409,body:{error:'Booking is not awaiting payment'}};
   const stripe=getStripe(),amount=Math.round(Number(booking.priceQuoted)*100);
   if(!Number.isSafeInteger(amount)||amount<50)return {status:400,body:{error:'Invalid invoice amount'}};
   if(booking.stripePaymentIntentId){
    const pi=await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
    if(['processing','succeeded','requires_capture'].includes(pi.status))return {status:409,body:{error:'Card payment is already received or processing'}};
    if(pi.status!=='canceled')await stripe.paymentIntents.cancel(pi.id,{}, {idempotencyKey:'invoice-cancel-card-'+pi.id});
   }
   const [saved]=rows<{stripe_invoice_id:string|null}>(await db.execute(sql`SELECT stripe_invoice_id FROM bookings WHERE id=${bId}`));
   let invoice:Stripe.Invoice|null=saved?.stripe_invoice_id?await stripe.invoices.retrieve(saved.stripe_invoice_id):null;
   if(!invoice){
    const found=await stripe.invoices.search({query:'metadata["bookingId"]:"'+bId+'"',limit:100});
    const active=found.data.filter(i=>i.status==='open'||i.status==='draft'||i.status==='paid');
    if(active.length>1)return {status:409,body:{error:'Multiple invoices exist for this booking. Reconcile them before issuing another.'}};
    invoice=active[0]??null;
   }
   if(invoice?.status==='paid')return {status:409,body:{error:'This invoice is paid. Reconcile the payment before issuing another.'}};
   if(invoice&&invoice.status==='open'&&invoice.amount_due!==amount)return {status:409,body:{error:'The existing invoice has a different total. Void it in Stripe before repricing.'}};
   const predecessor=invoice?.id??'initial';
   if(!invoice||invoice.status==='void'||invoice.status==='uncollectible'){
    const customer=await stripe.customers.create({email:booking.passengerEmail,name:booking.passengerName,metadata:{bookingId:String(bId)}},{idempotencyKey:'invoice-customer-'+bId});
    invoice=await stripe.invoices.create({customer:customer.id,collection_method:'send_invoice',days_until_due:7,
      pending_invoice_items_behavior:'exclude',metadata:{bookingId:String(bId)},description:'Royal Midnight — Reservation '+bId},
      {idempotencyKey:'invoice-'+bId+'-'+amount+'-'+predecessor});
   }
   await db.execute(sql`UPDATE bookings SET stripe_invoice_id=${invoice.id} WHERE id=${bId}`);
   if(invoice.status==='draft'){
    const customer=typeof invoice.customer==='string'?invoice.customer:invoice.customer!.id;
    if(invoice.amount_due===0)await stripe.invoiceItems.create({customer,invoice:invoice.id,amount,currency:'usd',description:'Royal Midnight reservation '+bId},{idempotencyKey:'invoice-line-'+invoice.id});
    const draft=await stripe.invoices.retrieve(invoice.id);
    if(draft.amount_due!==amount)throw new Error('Invoice amount mismatch. Review the draft in Stripe.');
    invoice=await stripe.invoices.finalizeInvoice(invoice.id,{}, {idempotencyKey:'invoice-finalize-'+invoice.id});
   }
   const url=invoice.hosted_invoice_url;
   if(!url)throw new Error('Invoice payment URL is unavailable');
   await withMailScope('invoice:'+invoice.id,()=>sendInvoiceToPassenger({id:bId,passengerName:booking.passengerName,passengerEmail:booking.passengerEmail,
     pickupAddress:booking.pickupAddress,dropoffAddress:booking.dropoffAddress,pickupAt:booking.pickupAt.toISOString(),vehicleClass:booking.vehicleClass,passengers:booking.passengers,priceQuoted:Number(booking.priceQuoted)},url,invoice!.invoice_pdf??null));
   return {status:200,body:{success:true,invoiceId:invoice.id,invoiceUrl:url}};
  });res.status(result.status).json(result.body);
 }catch(err){sendStripeError(req,res,err);}
});

// ─── Stripe webhook ──────────────────────────────────────────────────────────

async function confirmBookingFromPaymentIntent(bookingId:number,intentId:string):Promise<void>{
 const [booking]=await db.select().from(bookings).where(eq(bookings.id,bookingId));
 if(!booking)throw new Error('Payment booking not found');
 if(booking.status==='cancelled'){
  await withMailScope('booking-cancellation:'+bookingId,()=>settleBookingCancellation(bookingId,intentId));return;
 }
 if(booking.stripePaymentIntentId!==intentId)throw new Error('Payment intent no longer matches this booking');
 await db.update(bookings).set({status:booking.driverId?'confirmed':'pending',updatedAt:new Date()})
  .where(and(eq(bookings.id,bookingId),sql`${bookings.status} IN ('awaiting_payment','authorized')`));
 await enqueueBookingNotification(bookingId);
}
async function authorizeBookingFromPaymentIntent(bookingId:number,intentId:string):Promise<void>{
 const [booking]=await db.select().from(bookings).where(eq(bookings.id,bookingId));
 if(!booking)throw new Error('Payment booking not found');
 if(booking.status==='cancelled'){await settleBookingCancellation(bookingId,intentId);return;}
 if(booking.stripePaymentIntentId!==intentId)throw new Error('Payment intent no longer matches this booking');
 await db.update(bookings).set({status:'authorized',authorizedAt:new Date(),updatedAt:new Date()})
  .where(and(eq(bookings.id,bookingId),eq(bookings.status,'awaiting_payment')));
}

router.post("/webhook/stripe", async (req, res): Promise<void> => {
  const sig = req.headers["stripe-signature"] as string | undefined;
  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    const webhookSecret = await getWebhookSecret();
    if (!webhookSecret) {
      console.error(
        "[webhook] STRIPE_WEBHOOK_SECRET not set — refusing unsigned event",
      );
      res.status(503).json({ error: "Webhook signing secret not configured" });
      return;
    }
    if (!sig) {
      res.status(400).json({ error: "Missing Stripe-Signature header" });
      return;
    }
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Process first, THEN acknowledge.
  //
  // Vercel may freeze the function the moment a response is sent, so replying
  // up front meant payment_intent.succeeded could fail to promote the booking
  // out of awaiting_payment and never fire the confirmation emails — while
  // Stripe recorded a 200 and never retried. routes/cron.ts documents this
  // exact hazard and awaits its job before responding; the lesson had not been
  // carried across. Stripe allows 10 seconds, far more than these queries take.
  try {
    const object=event.data.object as unknown as {metadata?:Record<string,string>};
    const bookingId=Number(object.metadata?.bookingId)||0;
    await withLock(bookingId?'payment:'+bookingId:'stripe-event:'+event.id,async()=>{
    const [receipt]=rows<{status:string}>(await db.execute(sql`SELECT status FROM payment_events WHERE id=${event.id}`));
    if(receipt?.status==='done')return;
    await db.execute(sql`INSERT INTO payment_events(id,event_type,booking_id) VALUES(${event.id},${event.type},${bookingId||null})
      ON CONFLICT(id) DO UPDATE SET status='processing',attempts=payment_events.attempts+1,last_error=NULL`);
    if (await recordSupplementalPayment(event)) {
      await db.execute(sql`UPDATE payment_events SET status='done',processed_at=now(),last_error=NULL WHERE id=${event.id}`);
      return;
    }
    if(event.type==='payment_intent.succeeded'||event.type==='payment_intent.amount_capturable_updated'){
      const intent=event.data.object as Stripe.PaymentIntent;
      if(bookingId){
        const [booking]=await db.select().from(bookings).where(eq(bookings.id,bookingId));
        if(!booking)throw new Error('Payment booking not found');
        if(intent.currency!=='usd'||intent.amount<Math.round(Number(booking.priceQuoted)*100))throw new Error('Payment amount or currency mismatch');
      }
    }
    if (event.type === "payment_intent.created") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const bookingId = parseInt(intent.metadata.bookingId || "0");
      req.log.info(
        `[payments] PI created: ${intent.id}${bookingId ? ` (booking #${bookingId})` : ""}`,
      );
      if (bookingId) {
        const [current] = await db
          .select({ stripePaymentIntentId: bookings.stripePaymentIntentId })
          .from(bookings)
          .where(eq(bookings.id, bookingId));
        if (current && !current.stripePaymentIntentId) {
          await db
            .update(bookings)
            .set({ stripePaymentIntentId: intent.id, updatedAt: new Date() })
            .where(eq(bookings.id, bookingId));
        }
      }
    }

    if(event.type==='invoice.paid'){
     const invoice=event.data.object as Stripe.Invoice & {payment_intent?:string|Stripe.PaymentIntent|null};
     const bId=Number(invoice.metadata?.bookingId);
     if(bId){
      const [booking]=await db.select().from(bookings).where(eq(bookings.id,bId));
      if(!booking)throw new Error('Invoice booking not found');
      const [saved]=rows<{stripe_invoice_id:string|null}>(await db.execute(sql`SELECT stripe_invoice_id FROM bookings WHERE id=${bId}`));
      if(saved?.stripe_invoice_id&&saved.stripe_invoice_id!==invoice.id)throw new Error('Invoice no longer matches booking');
      if(invoice.currency!=='usd'||invoice.amount_paid<Math.round(Number(booking.priceQuoted)*100))throw new Error('Invoice payment does not cover booking');
      const pi=typeof invoice.payment_intent==='string'?invoice.payment_intent:invoice.payment_intent?.id;
      if(booking.status==='cancelled'){
       if(!pi)throw new Error('Cancelled paid invoice requires refund reconciliation');
       await withMailScope('booking-cancellation:'+bId,()=>settleBookingCancellation(bId,pi));
      }else{
       await db.update(bookings).set({status:'pending',stripePaymentIntentId:pi??undefined,updatedAt:new Date()}).where(and(eq(bookings.id,bId),eq(bookings.status,'awaiting_payment')));
       await enqueueBookingNotification(bId);
      }
     }
    }

    if (event.type === "payment_intent.amount_capturable_updated") {
      // Fired when a manual-capture PI reaches requires_capture state (card authorized)
      const intent = event.data.object as Stripe.PaymentIntent;
      const bookingId = parseInt(intent.metadata.bookingId || "0");
      if (bookingId && intent.status === "requires_capture") {
        await authorizeBookingFromPaymentIntent(bookingId, intent.id);
      }
    }

    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const bookingId = parseInt(intent.metadata.bookingId || "0");
      if (bookingId) {
        await confirmBookingFromPaymentIntent(bookingId, intent.id);
        await enqueueBookingNotification(bookingId);
      }
      // Save the payment method to the customer's user record for future off-session charges
      if (intent.customer && intent.payment_method) {
        try {
          const customerId =
            typeof intent.customer === "string"
              ? intent.customer
              : intent.customer.id;
          const pmId =
            typeof intent.payment_method === "string"
              ? intent.payment_method
              : intent.payment_method.id;
          const [user] = await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.stripeCustomerId, customerId));
          if (user) {
            await db
              .update(usersTable)
              .set({ defaultPaymentMethodId: pmId })
              .where(eq(usersTable.id, user.id));
          }
        } catch (pmErr: any) {
          console.warn(
            "[payments] webhook: could not save payment method to user record:",
            pmErr?.message,
          );
        }
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const bookingId = parseInt(intent.metadata.bookingId || "0");
      if (bookingId) {
        // Do NOT cancel the booking on payment failure — the passenger should be able to
        // retry with a different card. The booking stays at awaiting_payment.
        console.warn(
          `[payments] Payment failed for booking #${bookingId}:`,
          intent.last_payment_error?.message ?? "unknown reason",
        );
      }
    }

    if (event.type === "charge.succeeded") {
      const charge = event.data.object as Stripe.Charge;
      req.log.info(
        `[payments] charge.succeeded: ${charge.id} PI: ${charge.payment_intent} amount: $${(charge.amount / 100).toFixed(2)}`,
      );
    }

    if (event.type === "charge.updated") {
      const charge = event.data.object as Stripe.Charge;
      req.log.info(
        `[payments] charge.updated: ${charge.id} status: ${charge.status} PI: ${charge.payment_intent}`,
      );
    }

    if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created' || event.type === 'charge.dispute.closed') {
      const fact=event.data.object as unknown as {id:string;payment_intent?:string;amount?:number;amount_refunded?:number;currency?:string;status?:string};
      const [linked]=fact.payment_intent?await db.select({id:bookings.id}).from(bookings).where(eq(bookings.stripePaymentIntentId,fact.payment_intent)):[];
      await db.execute(sql`INSERT INTO financial_events(id,booking_id,kind,amount_cents,currency,status,reference)
       VALUES(${event.id},${linked?.id??null},${event.type},${fact.amount_refunded??fact.amount??0},${fact.currency??'usd'},${fact.status??'received'},${fact.id}) ON CONFLICT DO NOTHING`);
      if(linked && event.type==='charge.refunded')await db.update(bookings).set({refundAmount:sql`GREATEST(COALESCE(${bookings.refundAmount},0),${(fact.amount_refunded??0)/100})`}).where(eq(bookings.id,linked.id));
    }
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      req.log.info(
        `[payments] charge.refunded: ${charge.id} amount_refunded: $${(charge.amount_refunded / 100).toFixed(2)}`,
      );
    }

    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Stripe.Dispute;
      console.warn(
        "[payments] Chargeback dispute opened:",
        dispute.id,
        "amount:",
        dispute.amount,
        "reason:",
        dispute.reason,
      );
    }

    await db.execute(sql`UPDATE payment_events SET status='done',processed_at=now(),last_error=NULL WHERE id=${event.id}`);
    });
    res.json({ received: true });
  } catch (err: any) {
    await db.execute(sql`UPDATE payment_events SET status='failed',last_error=${String(err.message).slice(0,500)} WHERE id=${event.id}`).catch(()=>{});
    req.log?.error({ err, eventType: event.type }, "webhook_processing_failed");
    // 500 makes Stripe retry with backoff, which is exactly what we want for a
    // transient database or mail failure. Swallowing it lost the event.
    res.status(500).json({ error: "Processing failed" });
  }
});

// ─── Passenger: list saved payment methods ───────────────────────────────────

router.get(
  "/payments/saved-cards",
  requireAuth,
  async (req, res): Promise<void> => {
    const caller = req.currentUser!;
    const [user] = await db
      .select({
        stripeCustomerId: usersTable.stripeCustomerId,
        defaultPaymentMethodId: usersTable.defaultPaymentMethodId,
      })
      .from(usersTable)
      .where(eq(usersTable.id, caller.userId));

    if (!user?.stripeCustomerId) {
      res.json({ cards: [] });
      return;
    }

    try {
      const stripe = getStripe();
      const pms = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: "card",
      });
      res.json({
        cards: pms.data.map((pm) => ({
          id: pm.id,
          brand: pm.card?.brand ?? "card",
          last4: pm.card?.last4 ?? "••••",
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
          isDefault: pm.id === user.defaultPaymentMethodId,
        })),
      });
    } catch (err: any) {
      // A customer id Stripe no longer knows means this account genuinely has no
      // saved cards on the current Stripe account — an empty list is the honest
      // answer, and it stops the stale id from breaking the profile page too.
      if (isMissingCustomerError(err)) {
        await forgetStaleStripeCustomer(caller.userId, req.log);
        res.json({ cards: [] });
        return;
      }
      sendStripeError(req, res, err);
    }
  },
);

// ─── Passenger: delete a saved payment method ────────────────────────────────

router.delete(
  "/payments/saved-cards/:pmId",
  requireAuth,
  async (req, res): Promise<void> => {
    const pmId = String(req.params["pmId"] ?? "");
    const caller = req.currentUser!;

    const [user] = await db
      .select({
        stripeCustomerId: usersTable.stripeCustomerId,
        defaultPaymentMethodId: usersTable.defaultPaymentMethodId,
      })
      .from(usersTable)
      .where(eq(usersTable.id, caller.userId));

    if (!user?.stripeCustomerId) {
      res.status(404).json({ error: "No saved cards found" });
      return;
    }

    try {
      const stripe = getStripe();
      // Verify the PM belongs to this customer before detaching
      const pm = await stripe.paymentMethods.retrieve(pmId);
      const pmCustomer =
        typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
      if (pmCustomer !== user.stripeCustomerId) {
        res
          .status(403)
          .json({ error: "Payment method does not belong to your account" });
        return;
      }
      await stripe.paymentMethods.detach(pmId);

      // Clear default if this was the default card
      if (user.defaultPaymentMethodId === pmId) {
        await db
          .update(usersTable)
          .set({ defaultPaymentMethodId: null })
          .where(eq(usersTable.id, caller.userId));
      }
      res.json({ success: true });
    } catch (err: any) {
      sendStripeError(req, res, err);
    }
  },
);

// ─── Passenger: charge a tip off-session ─────────────────────────────────────

router.post(
  "/payments/tip/:bookingId",
  paymentLimiter(),
  requireAuth,
  async (req, res): Promise<void> => {
    const bId = parseInt(String(req.params["bookingId"] ?? ""), 10);
    if (!bId) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const amountCents = parseTipCents(req.body?.tipAmount);
    if (amountCents == null) {
      res.status(400).json({ error: "Tip amount must be between $1 and $500" });
      return;
    }

    const caller = req.currentUser!;

    try {
      const result = await withLock(`tip:${bId}`, async (tx) => {
        const [booking] = await tx
          .select()
          .from(bookings)
          .where(eq(bookings.id, bId));
        if (!booking) return { status: 404 as const, body: { error: "Booking not found" } };
        if (booking.userId !== caller.userId) {
          return { status: 403 as const, body: { error: "You can only tip on your own bookings" } };
        }
        if (booking.status !== "completed") {
          return { status: 400 as const, body: { error: "Tips can only be added to completed trips" } };
        }
        if (booking.tipAmount != null) {
          return { status: 409 as const, body: { error: "A tip has already been added to this booking" } };
        }

        const [user] = await tx
          .select({
            stripeCustomerId: usersTable.stripeCustomerId,
            defaultPaymentMethodId: usersTable.defaultPaymentMethodId,
          })
          .from(usersTable)
          .where(eq(usersTable.id, caller.userId));
        if (!user?.stripeCustomerId || !user.defaultPaymentMethodId) {
          return {
            status: 400 as const,
            body: { error: "No saved payment method on file. Please contact support to add a tip." },
          };
        }

        const stripe = getStripe();
        if (booking.tipPaymentIntentId) {
          // A pending/succeeded intent is a durable guard against a second
          // charge, even if the previous request died before its DB commit.
          const existing = await stripe.paymentIntents.retrieve(booking.tipPaymentIntentId);
          if (!tipMetadataMatches(existing, bId, caller.userId) || existing.amount !== amountCents) {
            return { status: 409 as const, body: { error: "A different tip payment is already in progress; reconcile it before retrying." } };
          }
          if (existing.status !== "canceled") {
            if (existing.status !== "succeeded") {
              return { status: 402 as const, body: { error: `Tip charge did not succeed (status: ${existing.status}). Please contact support.` } };
            }
            const [saved] = await tx
              .update(bookings)
              .set({ tipAmount: String(tipDollars(amountCents)), updatedAt: new Date() })
              .where(and(eq(bookings.id, bId), isNull(bookings.tipAmount), eq(bookings.tipPaymentIntentId, existing.id)))
              .returning({ id: bookings.id });
            if (!saved) return { status: 409 as const, body: { error: "A tip has already been recorded" } };
            return { status: 200 as const, body: { success: true, tipAmount: tipDollars(amountCents), paymentIntentId: existing.id } };
          }
        }

        const intent = await stripe.paymentIntents.create(
          {
            amount: amountCents,
            currency: "usd",
            customer: user.stripeCustomerId,
            payment_method: user.defaultPaymentMethodId,
            confirm: true,
            off_session: true,
            description: `Royal Midnight — Gratuity for Booking #RM-${String(bId).padStart(4, "0")}`,
            metadata: { bookingId: String(bId), type: "tip", userId: String(caller.userId) },
          },
          // Stable for the booking/user, so a retry after a network failure
          // replays the same Stripe operation instead of charging again.
          { idempotencyKey: `tip:${bId}:${caller.userId}` },
        );
        if (intent.status !== "succeeded") {
          await tx
            .update(bookings)
            .set({ tipPaymentIntentId: intent.id, updatedAt: new Date() })
            .where(and(eq(bookings.id, bId), isNull(bookings.tipAmount)));
          return { status: 402 as const, body: { error: `Tip charge did not succeed (status: ${intent.status}). Please contact support.` } };
        }

        const [saved] = await tx
          .update(bookings)
          .set({ tipAmount: String(tipDollars(amountCents)), tipPaymentIntentId: intent.id, updatedAt: new Date() })
          .where(and(eq(bookings.id, bId), isNull(bookings.tipAmount)))
          .returning({ id: bookings.id });
        if (!saved) return { status: 409 as const, body: { error: "A tip has already been recorded" } };
        return { status: 200 as const, body: { success: true, tipAmount: tipDollars(amountCents), paymentIntentId: intent.id } };
      });
      res.status(result.status).json(result.body);
    } catch (err: any) {
      // The saved card belongs to a customer Stripe no longer has. Off-session
      // charging is impossible, so say so plainly and drop the dead reference —
      // the on-session tip-checkout route below still works.
      if (isMissingCustomerError(err)) {
        await forgetStaleStripeCustomer(caller.userId, req.log);
        res
          .status(400)
          .json({
            error:
              "Your saved payment method is no longer valid. Please add a card again to leave a tip.",
          });
        return;
      }
      sendStripeError(req, res, err, "Tip charge failed — please try again.");
    }
  },
);

// ─── Passenger: create an on-session tip PaymentIntent (no saved card required) ──

router.post(
  "/payments/tip-checkout/:bookingId",
  paymentLimiter(),
  requireAuth,
  async (req, res): Promise<void> => {
    const bId = parseInt(String(req.params["bookingId"] ?? ""), 10);
    if (!bId) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const amountCents = parseTipCents(req.body?.tipAmount);
    if (amountCents == null) {
      res.status(400).json({ error: "Tip amount must be between $1 and $500" });
      return;
    }

    const caller = req.currentUser!;

    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      res.status(503).json({ error: "Stripe not configured" });
      return;
    }

    try {
      const stripe = getStripe();
      const result = await withLock(`tip:${bId}`, async (tx) => {
        const [booking] = await tx.select().from(bookings).where(eq(bookings.id, bId));
        if (!booking) return { status: 404 as const, body: { error: "Booking not found" } };
        if (booking.userId !== caller.userId) return { status: 403 as const, body: { error: "You can only tip on your own bookings" } };
        if (booking.status !== "completed") return { status: 400 as const, body: { error: "Tips can only be added to completed trips" } };
        if (booking.tipAmount != null) return { status: 409 as const, body: { error: "A tip has already been added to this booking" } };

        if (booking.tipPaymentIntentId) {
          const existing = await stripe.paymentIntents.retrieve(booking.tipPaymentIntentId);
          if (!tipMetadataMatches(existing, bId, caller.userId) || existing.amount !== amountCents) {
            return { status: 409 as const, body: { error: "A different tip payment is already in progress; finish or cancel it before changing the amount." } };
          }
          if (existing.status === "succeeded") {
            const [saved] = await tx.update(bookings).set({ tipAmount: String(tipDollars(amountCents)), updatedAt: new Date() })
              .where(and(eq(bookings.id, bId), isNull(bookings.tipAmount), eq(bookings.tipPaymentIntentId, existing.id)))
              .returning({ id: bookings.id });
            if (!saved) return { status: 409 as const, body: { error: "A tip has already been recorded" } };
            return { status: 200 as const, body: { success: true, tipAmount: tipDollars(amountCents), paymentIntentId: existing.id, publishableKey } };
          }
          if (existing.status !== "canceled") {
            return { status: 200 as const, body: { clientSecret: existing.client_secret, paymentIntentId: existing.id, publishableKey } };
          }
        }

        const intent = await stripe.paymentIntents.create(
          {
            amount: amountCents,
            currency: "usd",
            description: `Royal Midnight — Gratuity for Booking #RM-${String(bId).padStart(4, "0")}`,
            metadata: { bookingId: String(bId), type: "tip", userId: String(caller.userId) },
          },
          { idempotencyKey: `tip-checkout:${bId}:${caller.userId}:${amountCents}` },
        );
        if (!intent.client_secret) throw new Error("Stripe returned no tip client secret");
        await tx.update(bookings).set({ tipPaymentIntentId: intent.id, updatedAt: new Date() })
          .where(and(eq(bookings.id, bId), isNull(bookings.tipAmount)));
        return { status: 200 as const, body: { clientSecret: intent.client_secret, paymentIntentId: intent.id, publishableKey } };
      });
      res.status(result.status).json(result.body);
    } catch (err: any) {
      sendStripeError(req, res, err, "Could not initiate tip payment.");
    }
  },
);

// ─── Passenger: confirm a tip paid via on-session PaymentIntent ───────────────

router.post(
  "/payments/tip-confirm/:bookingId",
  paymentLimiter(),
  requireAuth,
  async (req, res): Promise<void> => {
    const bId = parseInt(String(req.params["bookingId"] ?? ""), 10);
    if (!bId) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const { paymentIntentId } = req.body as { paymentIntentId?: string };
    if (typeof paymentIntentId !== "string" || !/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) {
      res.status(400).json({ error: "paymentIntentId is required" });
      return;
    }

    const caller = req.currentUser!;

    try {
      const stripe = getStripe();
      const result = await withLock(`tip:${bId}`, async (tx) => {
        const [booking] = await tx.select().from(bookings).where(eq(bookings.id, bId));
        if (!booking) return { status: 404 as const, body: { error: "Booking not found" } };
        if (booking.userId !== caller.userId) return { status: 403 as const, body: { error: "You can only tip on your own bookings" } };
        if (booking.tipAmount != null && booking.tipPaymentIntentId === paymentIntentId) {
          return { status: 200 as const, body: { success: true, tipAmount: Number(booking.tipAmount), paymentIntentId } };
        }
        if (booking.tipAmount != null) return { status: 409 as const, body: { error: "A tip has already been added to this booking" } };
        if (booking.tipPaymentIntentId !== paymentIntentId) {
          return { status: 400 as const, body: { error: "Payment intent is not the active tip for this booking" } };
        }

        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (!tipMetadataMatches(intent, bId, caller.userId)) {
          return { status: 400 as const, body: { error: "Payment intent does not match this booking" } };
        }
        if (intent.status !== "succeeded") {
          return { status: 402 as const, body: { error: `Payment has not succeeded (status: ${intent.status})` } };
        }
        const confirmedCents = intent.amount_received ?? intent.amount;
        if (parseTipCents(confirmedCents / 100) == null) {
          return { status: 400 as const, body: { error: "Confirmed tip amount is out of valid range" } };
        }

        const [saved] = await tx
          .update(bookings)
          .set({ tipAmount: String(tipDollars(confirmedCents)), updatedAt: new Date() })
          .where(and(eq(bookings.id, bId), isNull(bookings.tipAmount), eq(bookings.tipPaymentIntentId, intent.id)))
          .returning({ id: bookings.id });
        if (!saved) return { status: 409 as const, body: { error: "A tip has already been recorded" } };

        const pm = intent.payment_method;
        if (pm) {
          const pmId = typeof pm === "string" ? pm : pm.id;
          await tx.update(usersTable).set({ defaultPaymentMethodId: pmId }).where(eq(usersTable.id, caller.userId));
        }
        return { status: 200 as const, body: { success: true, tipAmount: tipDollars(confirmedCents), paymentIntentId: intent.id } };
      });
      res.status(result.status).json(result.body);
    } catch (err: any) {
      sendStripeError(req, res, err, "Could not confirm tip payment.");
    }
  },
);

// ─── Save a payment method from a succeeded PaymentIntent ────────────────────
// Called by the frontend after a successful booking payment to reliably persist
// the card without depending on the webhook (which may not fire in all envs).

router.post(
  "/payments/save-payment-method",
  paymentLimiter(),
  requireAuth,
  async (req, res): Promise<void> => {
    const { paymentIntentId } = req.body as { paymentIntentId?: string };
    if (!paymentIntentId) {
      res.status(400).json({ error: "paymentIntentId is required" });
      return;
    }

    const caller = req.currentUser!;

    const [user] = await db
      .select({
        id: usersTable.id,
        stripeCustomerId: usersTable.stripeCustomerId,
      })
      .from(usersTable)
      .where(eq(usersTable.id, caller.userId));

    if (!user?.stripeCustomerId) {
      res.json({ saved: false, reason: "No Stripe customer on file" });
      return;
    }

    try {
      const stripe = getStripe();
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["payment_method"],
      });

      if (intent.status !== "succeeded") {
        res.json({ saved: false, reason: "Payment not yet succeeded" });
        return;
      }

      const pm = intent.payment_method as Stripe.PaymentMethod | null;
      if (!pm?.id) {
        res.json({ saved: false, reason: "No payment method on intent" });
        return;
      }

      // Attach to customer if not already attached
      const pmCustomer =
        typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
      if (pmCustomer !== user.stripeCustomerId) {
        await stripe.paymentMethods.attach(pm.id, {
          customer: user.stripeCustomerId,
        });
      }

      await db
        .update(usersTable)
        .set({ defaultPaymentMethodId: pm.id })
        .where(eq(usersTable.id, user.id));

      res.json({
        saved: true,
        card: {
          id: pm.id,
          brand: pm.card?.brand ?? "card",
          last4: pm.card?.last4 ?? "••••",
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
        },
      });
    } catch (err: any) {
      // Saving the card is a convenience that runs after the money has already
      // moved. A dead customer id must never turn that into a visible failure on
      // the confirmation screen — drop it and report the card as unsaved.
      if (isMissingCustomerError(err)) {
        await forgetStaleStripeCustomer(caller.userId, req.log);
        res.json({
          saved: false,
          reason:
            "Stripe customer no longer exists — a new one will be created on your next booking.",
        });
        return;
      }
      sendStripeError(req, res, err);
    }
  },
);

export default router;
