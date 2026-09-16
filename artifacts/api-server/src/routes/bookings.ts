import { overtimeOperation, loadOvertimeOperation, settleOvertime } from "../lib/overtimePayment.js";
import { addonRequestHash, loadAddonOperation, createAddonOperation } from "../lib/addonOperation.js";
import { payAddonCard, invoiceAddon } from "../lib/addonPayment.js";
import { withMailScope, withMailTransaction } from "../lib/mailOutbox.js";
import { commitTripCompletion, recordTripCompletion } from "../lib/tripCompletion.js";
import { enqueueBookingNotification } from "../lib/bookingJobs.js";
import { ValidatedBookingBody } from "../lib/bookingInput.js";
import { bookingAction, withLock, setActor, rows } from "../lib/durability.js";
import { tripConflicts, tripDurationMinutes, vehicleFits, type TripWindowInput } from "../lib/scheduling.js";
import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import Stripe from "stripe";
import { z } from "zod/v4";
import { eq, desc, and, or, isNull, ne, sql, inArray } from "drizzle-orm";
import {
  db,
  bookingsTable,
  driversTable,
  settingsTable,
  usersTable,
  promoCodesTable,
  reviewsTable,
  extraServicesTable,
  bookingExtrasTable,
  driverVehiclesTable,
  vehiclesTable,
  managedTravelersTable,
  bookingDriverBlocksTable,
  bookingItineraryStopsTable,
} from "@workspace/db";
import { requireAuth, requireAdmin, optionalAuth } from "../middleware/auth.js";
import { bookingLimiter } from "../lib/rateLimit.js";
import { signedObjectDownloadPath } from "../lib/signedUrl.js";
import { hasPgErrorCode, UNDEFINED_COLUMN } from "../lib/pgError.js";
import { hasDriverBlockTable } from "../lib/schemaGuards.js";
import {
  loadZoneCoverage,
  isTripVisibleToDriver,
  loadPickupPoints,
  loadPickupPoint,
  savePickupPoint,
} from "../lib/serviceZones.js";
import { serializeBooking } from "../lib/serializeBooking.js";
import { recordAcceptance, recordAcceptances } from "../lib/legalAcceptance.js";
import {
  loadBookingExtras,
  loadExtrasFor,
  driverExtrasTotal,
} from "../lib/bookingExtras.js";
import {
  computeHourlyOverage,
  OVERAGE_GRACE_MINUTES,
} from "../lib/hourlyOverage.js";
import { computePostTripCharge } from "../lib/pricing.js";
import {
  saveFareBreakdown,
  incrementFareBreakdown,
  loadChargeRates,
  loadOverageFares,
  loadBookingReceipts,
} from "../lib/fareBreakdown.js";
import { isPaidBooking } from "./adminBookingEdit.js";
import { sendStripeError } from "../lib/stripeError.js";
import {
  fetchCommissionPct,
  driverEarningsForBooking,
} from "../lib/commission.js";
import {
  isMissingCustomerError,
  forgetStaleStripeCustomer,
} from "../lib/stripeCustomer.js";
import {
  driverBlockReason,
  driverBlockMessage,
} from "../lib/driverEligibility.js";
import { getDriverWindows } from "../lib/driverWindows.js";
import { getRouteEstimate, DEFAULT_DURATION_MINUTES } from "../lib/maps.js";
import {
  HOURLY_RATES,
  DEFAULT_RATE_PER_MILE,
  DEFAULT_MAX_MILES_PER_HOUR,
  computeQuote,
  readQuoteExtensions,
  resolveHourlyRate,
} from "./quote.js";
import { evaluatePromoCode, releasePromoUsage } from "./promos.js";
import {
  sendBookingConfirmationPassenger,
  sendNewBookingAdmin,
  sendNewBookingAvailableToDrivers,
  sendBookingCancelledAdmin,
  sendBookingCancelledPassenger,
  sendDriverAcceptedAdmin,
  sendDriverAcceptedPassenger,
  sendDriverUnassignedAdmin,
  sendStatusChangedAdmin,
  sendDriverOnWay,
  sendDriverArrived,
  sendAccountInvitation,
  sendBookingAssignedDriver,
  sendAddonExtrasChargedEmail,
  sendAddonInvoiceToPassenger,
} from "../lib/mailer.js";
import {
  sendDriverOnWaySms,
  sendDriverArrivedSms,
  sendCancellationSms,
} from "../lib/sms.js";
import { sendNewRideOfferPush, sendDriverAssignedPush } from "../lib/push.js";
import {
  ListBookingsQueryParams,
  ListBookingsResponse,
  CreateBookingBody,
  GetBookingParams,
  GetBookingResponse,
  UpdateBookingParams,
  UpdateBookingBody,
  UpdateBookingResponse,
  CancelBookingParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ─── Driver availability helpers ─────────────────────────────────────────────

/**
 * The statuses that mean a driver is actively committed to a trip.
 * These are the only statuses that should block availability for new trips.
 */
const ACTIVE_TRIP_STATUSES = [
  "confirmed",
  "in_progress",
  "on_way",
  "on_location",
] as const;

/** 1-hour buffer on each side of an active trip (in milliseconds). */
const BUFFER_MS = 60 * 60 * 1000;

type BusyWindow = TripWindowInput;
async function getDriverBusyWindows(driverId: number, executor: Pick<typeof db, 'select'> = db): Promise<BusyWindow[]> {
 return executor.select({pickupAt:bookingsTable.pickupAt,estimatedDurationMinutes:bookingsTable.estimatedDurationMinutes,
 charterMode:bookingsTable.charterMode,charterHours:bookingsTable.charterHours}).from(bookingsTable)
 .where(and(eq(bookingsTable.driverId,driverId),inArray(bookingsTable.status,[...ACTIVE_TRIP_STATUSES])));
}
function hasConflict(trip: TripWindowInput, windows: BusyWindow[]) { return tripConflicts(trip,windows); }

/**
 * True when this error is Postgres 42703 (undefined_column).
 *
 * Drizzle wraps driver errors, so the pg error code is not on the object it
 * throws — it sits somewhere down the `cause` chain. Checking only the top
 * level silently misses every one of them.
 */
function isUndefinedColumn(err: unknown): boolean {
  return hasPgErrorCode(err, UNDEFINED_COLUMN);
}

const parseBooking = serializeBooking;

async function loadItineraries(bookingIds: number[]) {
  const grouped = new Map<number, Array<typeof bookingItineraryStopsTable.$inferSelect>>();
  if (bookingIds.length === 0) return grouped;
  const rows = await db.select().from(bookingItineraryStopsTable)
    .where(inArray(bookingItineraryStopsTable.bookingId, bookingIds))
    .orderBy(bookingItineraryStopsTable.bookingId, bookingItineraryStopsTable.sequence);
  for (const row of rows) grouped.set(row.bookingId, [...(grouped.get(row.bookingId) ?? []), row]);
  return grouped;
}

// ─── Cancellation policy ─────────────────────────────────────────────────────

type CancellationTier = "free" | "partial_25" | "full_100" | "non_cancellable";

interface CancelPreview {
  canCancel: boolean;
  tier: CancellationTier;
  feePercent: number;
  feeAmount: number;
  netRefund: number;
  hoursUntilPickup: number;
  message: string;
  priceQuoted: number;
}

function getCancellationPolicy(
  pickupAt: Date,
  priceQuoted: number,
  status: string,
): CancelPreview {
  const now = new Date();
  const hoursUntilPickup =
    (pickupAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (["completed", "cancelled", "in_progress"].includes(status)) {
    return {
      canCancel: false,
      tier: "non_cancellable",
      feePercent: 0,
      feeAmount: 0,
      netRefund: 0,
      hoursUntilPickup,
      message:
        status === "in_progress"
          ? "This ride is currently in progress and cannot be cancelled."
          : "This booking cannot be cancelled.",
      priceQuoted,
    };
  }

  if (status === "awaiting_payment") {
    return {
      canCancel: true,
      tier: "free",
      feePercent: 0,
      feeAmount: 0,
      netRefund: priceQuoted,
      hoursUntilPickup,
      message:
        "No payment has been processed yet — you may cancel at no charge.",
      priceQuoted,
    };
  }

  // Policy (2026-07-15, set by owner):
  //   • 12h or more before pickup ........ no charge
  //   • 2–12h before pickup .............. 25% fee
  //   • under 2h before pickup / no-show . 100% charge
  if (hoursUntilPickup >= 12) {
    return {
      canCancel: true,
      tier: "free",
      feePercent: 0,
      feeAmount: 0,
      netRefund: priceQuoted,
      hoursUntilPickup,
      message:
        "Cancellations made 12 hours or more before pickup are fully refunded — no fee applies.",
      priceQuoted,
    };
  }

  if (hoursUntilPickup >= 2) {
    const feeAmount = Math.round(priceQuoted * 0.25 * 100) / 100;
    return {
      canCancel: true,
      tier: "partial_25",
      feePercent: 25,
      feeAmount,
      netRefund: Math.round((priceQuoted - feeAmount) * 100) / 100,
      hoursUntilPickup,
      message:
        "Cancellations made 2–12 hours before pickup incur a 25% cancellation fee.",
      priceQuoted,
    };
  }

  const feeAmount = Math.round(priceQuoted * 100) / 100;
  return {
    canCancel: true,
    tier: "full_100",
    feePercent: 100,
    feeAmount,
    netRefund: 0,
    hoursUntilPickup,
    message:
      "Cancellations made less than 2 hours before pickup (including no-shows) are charged in full.",
    priceQuoted,
  };
}

/**
 * Delegates to the shared reader rather than keeping a second copy.
 *
 * The copy that used to live here divided by 100 unconditionally, so the moment
 * `driver_commission_pct` was saved as "0.7" instead of "70" — which the admin
 * Settings screen happily accepts — every chauffeur in the fleet would have been
 * quoted 0.7% of the fare. lib/commission.ts normalises both forms.
 */
const getCommissionPct = fetchCommissionPct;

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2024-06-20" as const, timeout:10000,maxNetworkRetries:0 });
}

/**
 * Bill the extra-time charge to the card the passenger already has on file.
 *
 * The original PaymentIntent for this trip was captured for the quoted amount
 * and cannot be increased after the fact, so overtime is a second, separate
 * charge — the same shape as a gratuity.
 *
 * Never throws. The trip is already complete and the row already says what is
 * owed; a card that declines is a collections problem for dispatch, not a
 * reason to fail the chauffeur's "end trip" tap. Returns the PaymentIntent id
 * on success and null otherwise, and the null is what tells the admin screen
 * the money is still outstanding.
 */
async function chargeExtraTime(
  booking: { id: number; userId: number | null; passengerEmail: string },
  charge: { fare: number; taxAmount: number; cardProcessingFee: number; total: number },
  minutes: number,
  allowCreate: boolean,
  log?: { warn: (obj: object, msg: string) => void },
) {
  const amount = charge.total;
  if (amount <= 0) return null;

  if (booking.userId == null) {
    log?.warn(
      { bookingId: booking.id, amount },
      "extra_time_uncollected_no_account",
    );
    return null;
  }

  try {
    const [user] = await db
      .select({
        stripeCustomerId: usersTable.stripeCustomerId,
        defaultPaymentMethodId: usersTable.defaultPaymentMethodId,
      })
      .from(usersTable)
      .where(eq(usersTable.id, booking.userId));

    // The operation survives Stripe's idempotency retention window. Persist the
    // unconfirmed intent before charging; a lost success response retrieves it.
    const operation = await overtimeOperation(booking.id, charge, minutes, allowCreate);
    const card = user?.stripeCustomerId && user.defaultPaymentMethodId
      ? {stripeCustomerId:user.stripeCustomerId, defaultPaymentMethodId:user.defaultPaymentMethodId} : null;
    const paymentIntentId = await payAddonCard(getStripe(), operation, card, 'extra_time');
    return {operation, paymentIntentId};
  } catch (err) {
    if (isMissingCustomerError(err) && booking.userId != null) {
      await forgetStaleStripeCustomer(booking.userId, log);
    }
    log?.warn(
      { bookingId: booking.id, amount, err: (err as Error).message },
      "extra_time_charge_failed",
    );
    return null;
  }
}

/** "Maria Gonzalez" -> "Maria G." — enough for a driver to tell one card from
 *  another in the open-pool list without publishing every passenger's full name
 *  to the whole fleet. */
function maskPassengerName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0]!;
  if (parts.length === 1) return first;
  return `${first} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`;
}

/**
 * What the chauffeur is shown for a trip, and what they will be paid for it.
 *
 * Three components, and they are paid on different terms:
 *
 *   fare      — commission on the undiscounted, pre-tax, pre-fee subtotal.
 *               Company promos and card fees never reduce it.
 *   overtime  — same commission. It is time worked like any other.
 *   extras    — the ones flagged paid_to_driver, in FULL with no commission.
 *               These are the chauffeur's own work or equipment (carrying a
 *               pet, fitting a car seat), so the company takes no share.
 *               Champagne and flowers are company goods and are excluded.
 *
 * Extras were previously absent from this entirely: they are not part of
 * fare_subtotal, so a chauffeur who fitted a car seat was paid nothing for it.
 */
function toDriverView<T extends { priceQuoted: number; fareSubtotal: number; commissionPct?:string|null }>(
  booking: T,
  commissionPct: number,
  opts: { driverExtras?: number; overtimeFare?: number } = {},
): Omit<T, "priceQuoted" | "fareSubtotal"> & {
  driverEarnings: number;
  driverFareEarnings: number;
  driverExtrasEarnings: number;
  driverOvertimeEarnings: number;
} {
  const { priceQuoted, fareSubtotal, ...rest } = booking;
  commissionPct=booking.commissionPct!=null?Number(booking.commissionPct):commissionPct;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const driverFareEarnings = round2(fareSubtotal * commissionPct);
  // The PRE-TAX overtime charge, not bookings.extra_charge — that now includes
  // the tax and card fee the customer pays, and the chauffeur earns on neither.
  const driverOvertimeEarnings = round2(
    (opts.overtimeFare ?? 0) * commissionPct,
  );
  const driverExtrasEarnings = round2(opts.driverExtras ?? 0);

  return {
    ...rest,
    // Broken out as well as totalled so the driver can see why they are paid
    // what they are paid, rather than one number they cannot check.
    driverFareEarnings,
    driverOvertimeEarnings,
    driverExtrasEarnings,
    driverEarnings: round2(
      driverFareEarnings + driverOvertimeEarnings + driverExtrasEarnings,
    ),
  };
}

router.get("/bookings", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListBookingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const caller = req.currentUser!;

  const conditions = [];
  // Driver open-pool requests get a widened status filter further down (the
  // pool must also include unassigned corporate "confirmed" bookings), so the
  // plain equality filter is skipped for that specific case.
  const isDriverPoolRequest =
    caller.role === "driver" &&
    (parsed.data.status === "pending" || parsed.data.status === "authorized") &&
    parsed.data.driverId == null;
  if (parsed.data.status && !isDriverPoolRequest)
    conditions.push(eq(bookingsTable.status, parsed.data.status));
  if (parsed.data.driverId != null)
    conditions.push(eq(bookingsTable.driverId, parsed.data.driverId));
  if (parsed.data.userId != null)
    conditions.push(eq(bookingsTable.userId, parsed.data.userId));
  if (parsed.data.startDate) {
    const d = new Date(parsed.data.startDate);
    if (isNaN(d.getTime())) {
      res
        .status(400)
        .json({
          error: "Invalid startDate — must be a parseable ISO date string.",
        });
      return;
    }
    conditions.push(sql`${bookingsTable.createdAt} >= ${d}`);
  }
  if (parsed.data.endDate) {
    const d = new Date(parsed.data.endDate);
    if (isNaN(d.getTime())) {
      res
        .status(400)
        .json({
          error: "Invalid endDate — must be a parseable ISO date string.",
        });
      return;
    }
    conditions.push(sql`${bookingsTable.createdAt} <= ${d}`);
  }

  // Drivers never see unconfirmed/unpaid bookings — only admin and passengers see them.
  // Passengers see their own (scoped below), admin sees all, drivers see none.
  if (caller.role === "driver" && !parsed.data.status) {
    conditions.push(ne(bookingsTable.status, "awaiting_payment"));
  }

  // Non-admin drivers: either see their own assigned bookings, or unassigned open pool
  // driverBusyWindows is populated here and used later to filter the open pool results.
  let driverBusyWindows: BusyWindow[] = [];
  let isDriverOpenPoolQuery = false;
  // Needed after this block to filter the pool by the driver's service zones.
  let poolDriverId: number | null = null;

  if (caller.role === "driver") {
    const requestedDriverId = parsed.data.driverId;
    const requestedStatus = parsed.data.status;

    if (requestedDriverId != null) {
      // When the frontend explicitly passes driverId, verify ownership directly from that
      // driver record. This is the most reliable path and avoids userId/email mismatch bugs
      // that occur when a driver has multiple records (onboarding + admin-created).
      const [targetDriver] = await db
        .select({
          id: driversTable.id,
          userId: driversTable.userId,
          email: driversTable.email,
        })
        .from(driversTable)
        .where(eq(driversTable.id, requestedDriverId));

      if (!targetDriver) {
        req.log.warn(
          {
            ip: req.ip,
            path: req.path,
            userId: req.currentUser?.userId,
            role: req.currentUser?.role,
          },
          "authorization_failed",
        );
        res.status(403).json({ error: "Access denied" });
        return;
      }

      // Verify caller owns this driver record (by userId or by email match)
      let authorized = targetDriver.userId === caller.userId;
      if (!authorized && targetDriver.email) {
        const [callerUser] = await db
          .select({ email: sql<string | null>`CASE WHEN email_verified_at IS NOT NULL THEN ${usersTable.email} ELSE NULL END` })
          .from(usersTable)
          .where(eq(usersTable.id, caller.userId));
        authorized =
          !!callerUser?.email &&
          callerUser.email.toLowerCase() === targetDriver.email.toLowerCase();
        // Retroactively link so future requests use the fast path
        if (authorized && !targetDriver.userId) {
          db.update(driversTable)
            .set({ userId: caller.userId })
            .where(eq(driversTable.id, targetDriver.id))
            .catch((err) =>
              console.error(
                "[bookings] retroactive driver userId link error:",
                err,
              ),
            );
        }
      }

      if (!authorized) {
        req.log.warn(
          {
            ip: req.ip,
            path: req.path,
            userId: req.currentUser?.userId,
            role: req.currentUser?.role,
          },
          "authorization_failed",
        );
        res.status(403).json({ error: "Access denied" });
        return;
      }
      // driverId condition already added at line ~209 via parsed.data.driverId
    } else {
      // No explicit driverId — look up the driver by caller identity.
      // Order by total_rides DESC so we always get the most active record when
      // a driver has two entries (admin-created with history + onboarding record).
      const driverPoolColumns = {
        id: driversTable.id,
        totalRides: driversTable.totalRides,
        approvalStatus: driversTable.approvalStatus,
        complianceHold: driversTable.complianceHold,
        // Needed by driverBlockReason: the three-warning suspension writes
        // "paused" here, and nothing used to read it.
        status: driversTable.status,
      };
      const byUserId = await db
        .select(driverPoolColumns)
        .from(driversTable)
        .where(eq(driversTable.userId, caller.userId))
        .orderBy(desc(driversTable.totalRides));
      let driverRow:
        | {
            id: number;
            approvalStatus: string;
            complianceHold: boolean;
            status: string;
          }
        | undefined = byUserId[0];

      // Fallback: match by email if userId link was never set
      if (!driverRow) {
        const [callerUser] = await db
          .select({ email: sql<string | null>`CASE WHEN email_verified_at IS NOT NULL THEN ${usersTable.email} ELSE NULL END` })
          .from(usersTable)
          .where(eq(usersTable.id, caller.userId));
        if (callerUser?.email) {
          const found = await db
            .select(driverPoolColumns)
            .from(driversTable)
            .where(eq(driversTable.email, callerUser.email))
            .orderBy(desc(driversTable.totalRides));
          driverRow = found[0];
          if (driverRow) {
            db.update(driversTable)
              .set({ userId: caller.userId })
              .where(eq(driversTable.id, driverRow.id))
              .catch((err) =>
                console.error(
                  "[bookings] retroactive driver userId link error:",
                  err,
                ),
              );
          }
        }
      }

      if (!driverRow) {
        res.json([]);
        return;
      }

      if (requestedStatus === "pending" || requestedStatus === "authorized") {
        // The open pool is the passenger list: who is being picked up, at which
        // address, at what time. POST /auth/driver-register is public and leaves
        // the account at approvalStatus="pending", so without this check anyone
        // could sign up as a driver and read it.
        //
        // POST /bookings/:id/accept already refuses a non-approved driver — the
        // check existed on the write and was missing on the read. Same criteria
        // here, deliberately including complianceHold: a driver with an expired
        // licence may not work, so they have no reason to see the queue either.
        const poolBlockReason = driverBlockReason(driverRow);
        if (poolBlockReason) {
          req.log.warn(
            {
              ip: req.ip,
              path: req.path,
              userId: caller.userId,
              driverId: driverRow.id,
              reason: poolBlockReason,
            },
            "authorization_failed",
          );
          res.json([]);
          return;
        }
        // A trip taken off this driver for missing the confirmation deadline
        // goes back to the pool for everyone else — but must never be offered
        // to them again, or it would reappear moments after being removed.
        // Skipped entirely until migration 0008 has run: with no table there
        // can be no blocks, and referencing it would take the pool down.
        if (await hasDriverBlockTable()) {
          conditions.push(sql`NOT EXISTS (
          SELECT 1 FROM booking_driver_blocks bdb
           WHERE bdb.booking_id = ${bookingsTable.id}
             AND bdb.driver_id  = ${driverRow.id}
        )`);
        }
        // Requesting the open/unassigned pool — includes pending and authorized
        // bookings, plus corporate bookings (those are created directly as
        // "confirmed" with no payment step and still need a driver to accept).
        // Pre-fetch this driver's busy windows so conflicting trips can be hidden below.
        conditions.push(isNull(bookingsTable.driverId));
        conditions.push(
          inArray(bookingsTable.status, ["pending", "authorized", "confirmed"]),
        );
        isDriverOpenPoolQuery = true;
        poolDriverId = driverRow.id;
        driverBusyWindows = await getDriverBusyWindows(driverRow.id);
      } else {
        // Default: own assigned bookings only
        conditions.push(eq(bookingsTable.driverId, driverRow.id));
      }
    }
  }

  // Passengers and corporate accounts can only see their own bookings
  // Include both userId-linked AND email-matched (admin-created) bookings
  if (caller.role === "passenger" || caller.role === "corporate") {
    const requestedUserId = parsed.data.userId;
    if (requestedUserId != null && requestedUserId !== caller.userId) {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const [callerUser] = await db
      .select({ email: sql<string | null>`CASE WHEN email_verified_at IS NOT NULL THEN ${usersTable.email} ELSE NULL END` })
      .from(usersTable)
      .where(eq(usersTable.id, caller.userId));
    const userEmail = callerUser?.email ?? "";
    conditions.push(
      or(
        eq(bookingsTable.userId, caller.userId),
        and(
          eq(bookingsTable.passengerEmail, userEmail),
          isNull(bookingsTable.userId),
        ),
      )!,
    );
  }

  if (caller.role === "admin") {
    // Admin gets a joined result with the user's role so the UI can distinguish corporate vs standard bookings
    const rows = await db
      .select({ booking: bookingsTable, userRole: usersTable.role })
      .from(bookingsTable)
      .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(bookingsTable.createdAt));

    // Extras attached here too. This branch was the one that got missed, which
    // is why the admin list showed no add-ons while the driver portal did.
    const adminExtras = await loadBookingExtras(rows.map((r) => r.booking.id));
    // The recorded money breakdown, so dispatch can see what tax and card fee a
    // booking actually carried — and, on a completed charter, whether the extra
    // time was ever collected.
    const adminReceipts = await loadBookingReceipts(
      rows.map((r) => r.booking.id),
    );
    res.json(
      rows.map(({ booking, userRole }) => ({
        ...parseBooking(booking),
        extras: adminExtras.get(booking.id) ?? [],
        receipt: adminReceipts.get(booking.id) ?? null,
        userRole: userRole ?? null,
      })),
    );
    return;
  }

  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(bookingsTable.createdAt));

  const parsed2 = bookings.map(parseBooking);

  if (caller.role === "driver") {
    const commissionPct = await getCommissionPct();
    let driverBookings = parsed2;

    // For the open pool, hide trips that conflict with the driver's existing schedule.
    if (isDriverOpenPoolQuery && driverBusyWindows.length > 0) {
      driverBookings = parsed2.filter(
        (b) => !hasConflict(b, driverBusyWindows),
      );
    }

    // ...and trips outside the driver's service areas. This intentionally fails
    // closed: unknown coordinates or missing coverage must never expose a ride
    // from another market.
    if (isDriverOpenPoolQuery && poolDriverId != null) {
      const coverage = await loadZoneCoverage(poolDriverId);
      const points = await loadPickupPoints(driverBookings.map((b) => b.id));
      driverBookings = driverBookings.filter((b) =>
        isTripVisibleToDriver(points.get(b.id) ?? null, coverage),
      );
    }

    // The open pool is a broadcast: every approved driver in the fleet sees it,
    // and all but one of them will never take the trip. What they need to
    // decide is where, when, and what it pays. Contact details, free-text
    // requests and VIP notes are withheld until the trip is actually assigned —
    // the driver who accepts gets them from GET /bookings (assigned branch) and
    // GET /bookings/:id. vipNotes in particular is admin-only elsewhere:
    // PATCH /users/:id refuses to let anyone but an admin write it.
    if (isDriverOpenPoolQuery) {
      // Extras ARE included in the broadcast, unlike contact details: a car
      // seat or a pet changes whether a driver can take the trip at all, so
      // withholding it until acceptance would mean accepting blind. They carry
      // no personal information.
      const poolExtras = await loadBookingExtras(
        driverBookings.map((b) => b.id),
      );
      const poolItineraries = await loadItineraries(driverBookings.map((b) => b.id));
      res.json(
        driverBookings.map((b) => {
          const extras = poolExtras.get(b.id) ?? [];
          return {
            ...toDriverView(b, commissionPct, {
              driverExtras: driverExtrasTotal(extras),
            }),
            extras,
            itinerary: poolItineraries.get(b.id) ?? [],
            passengerName: maskPassengerName(
              (b as { passengerName?: unknown }).passengerName,
            ),
            passengerEmail: null,
            passengerPhone: null,
            specialRequests: null,
            passengerPreferences: null,
          };
        }),
      );
      return;
    }

    // Attach passenger preferences so the driver can stage the vehicle correctly.
    // Batch-fetch preferences for all unique userIds in this response.
    const userIds = [
      ...new Set(
        driverBookings
          .map((b) => (b as any).userId)
          .filter(Boolean) as number[],
      ),
    ];
    const prefsByUserId = new Map<number, Record<string, unknown>>();
    if (userIds.length > 0) {
      const prefRows = await db
        .select({
          id: usersTable.id,
          cabinTempF: usersTable.cabinTempF,
          musicPreference: usersTable.musicPreference,
          quietRide: usersTable.quietRide,
          preferredBeverage: usersTable.preferredBeverage,
          opensOwnDoor: usersTable.opensOwnDoor,
          addressTitle: usersTable.addressTitle,
          vipNotes: usersTable.vipNotes,
        })
        .from(usersTable)
        .where(
          userIds.length === 1
            ? eq(usersTable.id, userIds[0]!)
            : inArray(usersTable.id, userIds),
        );
      for (const p of prefRows) {
        const { id, ...prefs } = p;
        // Only include if at least one preference is set
        if (Object.values(prefs).some((v) => v != null && v !== false)) {
          prefsByUserId.set(id, prefs);
        }
      }
    }

    const assignedExtras = await loadBookingExtras(
      driverBookings.map((b) => b.id),
    );
    const itineraries = await loadItineraries(driverBookings.map((b) => b.id));
    const overtimeFares = await loadOverageFares(
      driverBookings.map((b) => b.id),
    );
    res.json(
      driverBookings.map((b) => {
        const extras = assignedExtras.get(b.id) ?? [];
        const view = toDriverView(b, commissionPct, {
          driverExtras: driverExtrasTotal(extras),
          // Rows from before the split stored the untaxed figure in extra_charge.
          overtimeFare:
            overtimeFares.get(b.id) ??
            (parseFloat(
              String((b as { extraCharge?: unknown }).extraCharge ?? "0"),
            ) ||
              0),
        });
        const uid = (b as any).userId as number | null;
        const passengerPreferences = uid
          ? (prefsByUserId.get(uid) ?? null)
          : null;
        return { ...view, extras, passengerPreferences, itinerary: itineraries.get(b.id) ?? [] };
      }),
    );
    return;
  }

  // Return data as-is for passenger/corporate — skip Zod re-validation to avoid
  // enum mismatches from legacy seeded rows with old vehicleClass values.
  // Extras are attached because the passenger paid for them and had no way to
  // see, on any screen, what they had actually booked.
  const listExtras = await loadBookingExtras(parsed2.map((b) => b.id));
  res.json(parsed2.map((b) => ({ ...b, extras: listExtras.get(b.id) ?? [] })));
});

router.post("/bookings", bookingLimiter(), optionalAuth, async (req, res): Promise<void> => {
  // Public endpoint — allows anonymous booking creation from the booking form.
  // Corporate account paymentType is restricted: caller must be authenticated as role=corporate (or admin).
  const parsed = ValidatedBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const caller = req.currentUser;
  const checkoutKey=typeof req.body?.checkoutKey==='string' && /^[a-zA-Z0-9-]{20,100}$/.test(req.body.checkoutKey)?req.body.checkoutKey:null;
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify([caller?.userId??null,req.body])).digest('hex');
  if(checkoutKey){
    const [previous]=rows<{id:number;checkout_fingerprint:string}>(await db.execute(sql`SELECT id,checkout_fingerprint FROM bookings WHERE checkout_key=${checkoutKey}`));
    if(previous){
      if(previous.checkout_fingerprint!==fingerprint){res.status(409).json({error:'Checkout details changed. Start a new reservation.'});return;}
      const [existing]=await db.select().from(bookingsTable).where(eq(bookingsTable.id,previous.id));
      res.status(201).json({...GetBookingResponse.parse(parseBooking(existing)),trackingToken:existing.trackingToken});return;
    }
  }
  const isCorporate = parsed.data.paymentType === "corporate_account";

  if (isCorporate) {
    if (!caller || (caller.role !== "corporate" && caller.role !== "admin")) {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
      res
        .status(403)
        .json({
          error:
            "Corporate account bookings require a corporate or admin account",
        });
      return;
    }
  }

  // ── Booking owner ───────────────────────────────────────────────────────────
  // userId is never taken from the body on trust: an anonymous caller could
  // otherwise attribute bookings to any account. Admins may book on anyone's
  // behalf, and an executive assistant may book for a traveler they manage;
  // everyone else is pinned to their own id.
  let bookingUserId: number | null = caller?.role === "admin" ? (parsed.data.userId ?? null) : caller?.userId ?? null;
  const requestedUserId = parsed.data.userId ?? null;
  if (requestedUserId != null && requestedUserId !== caller?.userId) {
    if (caller?.role === "admin") {
      bookingUserId = requestedUserId;
    } else if (caller) {
      const [managed] = await db
        .select({ travelerId: managedTravelersTable.travelerId })
        .from(managedTravelersTable)
        .where(
          and(
            eq(managedTravelersTable.eaUserId, caller.userId),
            eq(managedTravelersTable.travelerId, requestedUserId),
          ),
        );
      if (managed) bookingUserId = requestedUserId;
    }
  }

  // ── Server-side fare derivation (CN-001) ────────────────────────────────────
  // The fare is never taken from the request body. It is recomputed here with
  // the same engine that answers POST /quote, then extras and any promo are
  // applied on top using database values. A client-supplied priceQuoted that
  // disagrees is logged and ignored, so a tampered request cannot produce a
  // free ride and an honest one is never rejected over rounding.
  const ext = readQuoteExtensions(req.body);

  // Extras are priced from extra_services, never from the body — and priced
  // BEFORE the quote, because they are part of the taxable base. They used to
  // be added to the total after tax and the card fee had already been computed,
  // so add-ons were the one line on the invoice that carried neither.
  const requestedExtras = parsed.data.extras ?? [];
  const pricedExtras: Array<{ id: number; quantity: number; price: number }> =
    [];
  if (requestedExtras.length) {
    const services = await db
      .select({ id: extraServicesTable.id, price: extraServicesTable.price })
      .from(extraServicesTable)
      .where(
        and(
          inArray(
            extraServicesTable.id,
            requestedExtras.map((e) => e.id),
          ),
          eq(extraServicesTable.isActive, true),
        ),
      );
    for (const s of services) {
      pricedExtras.push({
        id: s.id,
        quantity: requestedExtras.find((e) => e.id === s.id)?.quantity ?? 1,
        price: parseFloat(String(s.price)) || 0,
      });
    }
    if(services.length!==requestedExtras.length){res.status(400).json({error:'An extra service is unavailable. Refresh your selection.'});return;}
  }
  const extrasTotal =
    Math.round(
      pricedExtras.reduce((sum, e) => sum + e.price * e.quantity, 0) * 100,
    ) / 100;

  const quoteOutcome = await computeQuote({
    pickupAddress: parsed.data.pickupAddress,
    dropoffAddress: parsed.data.dropoffAddress,
    vehicleClass: parsed.data.vehicleClass as string,
    pickupAt: parsed.data.pickupAt,
    waypoints: ext.waypoints,
    charterMode: ext.charterMode,
    charterHours: ext.charterHours,
    extrasTotal,
    userId:
      isCorporate && caller?.role === "corporate"
        ? caller.userId
        : (bookingUserId ?? undefined),
    // Admins take phone bookings for trips that may be imminent, and may agree
    // a charter block shorter than the published minimum.
    skipLeadTimeCheck: caller?.role === "admin",
    skipCharterMinimumCheck: caller?.role === "admin",
  });
  if (!quoteOutcome.ok) {
    res.status(quoteOutcome.status).json(quoteOutcome.body);
    return;
  }
  const quote = quoteOutcome.quote;

  // Promo discount is re-derived from the promo_codes row. An invalid or
  // exhausted code yields no discount rather than failing the whole booking.
  // totalWithTax already contains the add-ons, taxed and fee'd.
  const grossTotal = quote.totalWithTax;
  let discountAmount = 0;
  let appliedPromoCode: string | null = null;
  if (parsed.data.promoCode) {
    // bookingUserId, so a per-customer limit is counted against the passenger
    // this booking is actually for — including an assistant booking on a
    // traveller's behalf, where the traveller is the one holding the offer.
    const promo = await evaluatePromoCode(
      parsed.data.promoCode,
      grossTotal,
      bookingUserId,
    );
    if (promo.valid && promo.discountAmount != null) {
      discountAmount = promo.discountAmount;
      appliedPromoCode = promo.code;
    }
  }

  const priceQuoted = Math.max(
    0,
    Math.round((grossTotal - discountAmount) * 100) / 100,
  );
  // Driver commission base: base fare + billable miles (+surge) only. Taxes,
  // the card fee, promo discounts and the airport fee are all company-side —
  // the driver never earns on them. Flat routes pay commission on the flat price.
  const fareSubtotal =
    quote.fixedRoutePrice ??
    Math.round(
      (quote.baseFare + quote.distanceCharge + quote.surgeAdjustment) * 100,
    ) / 100;

  if (Math.abs(parsed.data.priceQuoted - priceQuoted) > 0.01) {
    console.warn(
      `[bookings] fare mismatch — client sent ${parsed.data.priceQuoted}, server derived ${priceQuoted}; using server value`,
    );
  }

  // A promo can legitimately discount a booking to $0 — there is no card to
  // charge, so skip the awaiting_payment/Stripe step and drop it straight into
  // the same "pending" state a paid booking reaches. This is now driven by the
  // server-derived price, so a client can no longer force it.
  const isFreeBooking = !isCorporate && priceQuoted <= 0;

  // The hourly rate this charter was actually quoted at: the admin-set rate for
  // the vehicle class if there is one, otherwise the built-in default. Resolved
  // here so it can be frozen onto the booking below.
  const hourlyRateForBooking = await resolveHourlyRate(
    parsed.data.vehicleClass as string,
  );

  const bookingValues = {
    // Explicit field list — never spread the request body, which would let a
    // caller set columns the schema does not intend them to control.
    passengerName: parsed.data.passengerName,
    passengerEmail: parsed.data.passengerEmail,
    passengerPhone: parsed.data.passengerPhone,
    pickupAddress: parsed.data.pickupAddress,
    dropoffAddress: parsed.data.dropoffAddress,
    pickupAt: new Date(parsed.data.pickupAt),
    vehicleClass: parsed.data.vehicleClass,
    passengers: parsed.data.passengers,
    luggageCount: parsed.data.luggageCount,
    flightNumber: parsed.data.flightNumber ?? null,
    specialRequests: parsed.data.specialRequests ?? null,
    userId: bookingUserId,
    // Audit trail: who actually placed this booking, when that's someone
    // other than who it's for (an EA booking for a managed traveler, or
    // admin booking on a passenger's behalf) — bookingUserId's own
    // derivation above is the authority on whether that happened. The
    // client sends this too but it was never read; deriving it here instead
    // of trusting the body is the same reasoning as bookingUserId itself.
    bookedByUserId: bookingUserId !== (caller?.userId ?? null) ? (caller?.userId ?? null) : null,
    promoCode: appliedPromoCode,
    priceQuoted: String(priceQuoted),
    fareSubtotal: String(fareSubtotal),
    discountAmount: discountAmount > 0 ? String(discountAmount) : null,
    paymentType: parsed.data.paymentType ?? "standard",
    // The trip's own shape, which was priced and then thrown away.
    //
    // readQuoteExtensions() has always read charterMode/charterHours/waypoints
    // off the body and computeQuote() has always priced them — an hourly
    // charter was billed at the hourly rate correctly. But none of the three
    // was ever written to the row, so every booking was stored as a plain
    // point-to-point transfer with charter_mode NULL. Nothing downstream could
    // tell an hourly charter from an airport run: not the driver's manifest,
    // not the passenger's receipt, not the admin list, and not the overage
    // timer, which needs charter_hours to know what was contracted.
    charterMode: ext.charterMode === "hourly" ? "hourly" : null,
    charterHours:
      ext.charterMode === "hourly" ? (ext.charterHours ?? null) : null,
    waypoints: ext.waypoints?.length ? JSON.stringify(ext.waypoints) : null,
    // Frozen now rather than at trip start so the passenger's receipt can show
    // the terms they agreed to, and so overage is computed against the rate
    // quoted at booking even if pricing changes in between.
    hourlyRate:
      ext.charterMode === "hourly" ? String(hourlyRateForBooking) : null,
    maxMilesPerHour:
      ext.charterMode === "hourly" ? DEFAULT_MAX_MILES_PER_HOUR : null,
    // Corporate bookings are confirmed immediately; fully-discounted bookings skip
    // payment and go straight to pending (open driver pool). Everyone else
    // (including admin-manual) awaits payment.
    status: isCorporate
      ? "confirmed"
      : isFreeBooking
        ? "pending"
        : "awaiting_payment",
    // Public handle for the confirmation and tracking pages (CN-005).
    trackingToken: crypto.randomBytes(16).toString("hex"),
  };

  const booking=await withLock('checkout:'+(checkoutKey??crypto.randomUUID()),async tx=>{
    await setActor(tx,caller?.userId);
    if(checkoutKey){
      const [previous]=rows<{id:number;checkout_fingerprint:string}>(await tx.execute(sql`SELECT id,checkout_fingerprint FROM bookings WHERE checkout_key=${checkoutKey}`));
      if(previous){
        if(previous.checkout_fingerprint!==fingerprint)throw Object.assign(new Error('Checkout details changed. Start a new reservation.'),{status:409});
        const [existing]=await tx.select().from(bookingsTable).where(eq(bookingsTable.id,previous.id));return existing;
      }
    }
    if(appliedPromoCode){
      await tx.execute(sql`SELECT id FROM promo_codes WHERE code=${appliedPromoCode} FOR UPDATE`);
      const current=await evaluatePromoCode(appliedPromoCode,grossTotal,bookingUserId,tx);
      if(!current.valid || current.discountAmount!==discountAmount)throw Object.assign(new Error('This promotion is no longer available. Refresh your quote.'),{status:409});
      await tx.update(promoCodesTable).set({usedCount:sql`${promoCodesTable.usedCount}+1`}).where(eq(promoCodesTable.code,appliedPromoCode));
    }
    const [created]=await tx.insert(bookingsTable).values({...bookingValues,
      estimatedDurationMinutes:ext.charterMode==='hourly'?Math.max(quote.estimatedDuration??60,(ext.charterHours??0)*60):quote.estimatedDuration??60,
      estimatedDistanceMiles:String(quote.estimatedDistance)}).returning();
    const commission=await getCommissionPct();
    await tx.execute(sql`UPDATE bookings SET checkout_key=${checkoutKey},checkout_fingerprint=${fingerprint},commission_pct=${commission},
      tax_amount=${quote.taxAmount},card_fee=${quote.cardProcessingFee},airport_fee=${quote.airportFee},extras_total=${quote.extrasTotal},
      pickup_lat=${quote.pickupPoint?.lat??null},pickup_lng=${quote.pickupPoint?.lng??null} WHERE id=${created.id}`);
    if(pricedExtras.length)await tx.insert(bookingExtrasTable).values(pricedExtras.map(e=>({bookingId:created.id,extraServiceId:e.id,quantity:e.quantity,priceAtBooking:String(e.price)})));
    if(created.charterMode==='hourly')await tx.insert(bookingItineraryStopsTable).values([
      ...ext.waypoints.map((address,sequence)=>({bookingId:created.id,sequence,kind:'stop',address:address.trim()})),
      {bookingId:created.id,sequence:ext.waypoints.length,kind:'final',address:created.dropoffAddress}]);
    if(isCorporate||isFreeBooking)await enqueueBookingNotification(created.id,tx);
    return created;
  });
  await recordAcceptances(req,['terms','privacy'],{bookingId:booking.id,userId:bookingUserId,email:parsed.data.passengerEmail});

  // trackingToken rides alongside the contract response rather than inside it:
  // it is the one field the creator must receive and nobody else ever should,
  // so it stays out of the shared booking shape that other endpoints return.


  res.status(201).json({
    ...GetBookingResponse.parse(parseBooking(booking)),
    trackingToken: booking.trackingToken,
  });
});

// Public receipt/tracking endpoint, addressed by an unguessable token (CN-005).
//
// This replaces GET /bookings/:id/track. Booking ids are sequential, so that
// route let anyone walk id=1..N and harvest every customer's name, home
// address, destination and pickup time — for a chauffeur service that is a
// physical-safety exposure, not just a privacy one.
//
// Holding the token is the authorization: it is only ever returned to whoever
// created the booking, so returning the full receipt to a token holder is the
// same trust model as any "manage my booking" link. The email stays masked
// because the page only needs to show where the receipt went.
router.get("/bookings/track/:token", async (req, res): Promise<void> => {
  const token = String(req.params["token"] ?? "");
  // Reject anything that is not a well-formed token before touching the DB, so
  // this endpoint can never be used as a scan surface.
  if (!/^[0-9a-f]{32,64}$/.test(token)) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  let booking: typeof bookingsTable.$inferSelect | undefined;
  try {
    [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.trackingToken, token));
  } catch (err: unknown) {
    // Same migration window as booking creation — see the insert above.
    if (!isUndefinedColumn(err)) throw err;
    console.error(
      "[bookings] tracking_token column is missing — run migration 0004_booking_tracking_token.sql",
    );
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const maskedEmail = booking.passengerEmail
    ? booking.passengerEmail.replace(/^(.).+(@.+)$/, "$1***$2")
    : null;

  // Never cached by a shared proxy — the URL is a bearer credential.
  res.set("Cache-Control", "no-store");

  res.json({
    id: booking.id,
    status: booking.status,
    passengerName: booking.passengerName,
    passengerEmail: maskedEmail,
    pickupAddress: booking.pickupAddress,
    dropoffAddress: booking.dropoffAddress,
    pickupAt: booking.pickupAt.toISOString(),
    driverId: booking.driverId,
    vehicleClass: booking.vehicleClass,
    passengers: booking.passengers,
    luggageCount: booking.luggageCount,
    flightNumber: booking.flightNumber ?? null,
    specialRequests: booking.specialRequests ?? null,
    priceQuoted: booking.priceQuoted ? parseFloat(booking.priceQuoted) : null,
    discountAmount: booking.discountAmount
      ? parseFloat(booking.discountAmount)
      : null,
    promoCode: booking.promoCode ?? null,
    paymentType: booking.paymentType ?? null,
  });
});

// Driver info for passenger — reveals phone, vehicle, and plate only within 48h of pickup.
// This keeps personal contact details private until the trip is close enough to be relevant.
router.get(
  "/bookings/:id/driver-info",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetBookingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, params.data.id));
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    // The old condition short-circuited on `caller.role !== "driver"`, so ANY
    // driver account — not just the assigned one — got driverName, driverPhone
    // and regPlate for an arbitrary booking id. Chained with the open driver
    // registration that was trivial to reach.
    //
    // The `passengerEmail !== (caller as any).email` term was also dead: AuthUser
    // is {userId, role} and never carries an email, so it was always true. Its
    // real-world effect was a passenger whose booking is linked only by email
    // (created by an admin) getting a 403 they should not have. Both fixed here,
    // matching the pattern GET /bookings/:id already uses.
    const caller = req.currentUser!;
    if (caller.role === "driver") {
      const [driverRow] = await db
        .select({ id: driversTable.id })
        .from(driversTable)
        .where(eq(driversTable.userId, caller.userId));
      if (!driverRow || booking.driverId !== driverRow.id) {
        req.log.warn(
          {
            ip: req.ip,
            path: req.path,
            userId: caller.userId,
            role: caller.role,
          },
          "authorization_failed",
        );
        res.status(403).json({ error: "Access denied" });
        return;
      }
    } else if (caller.role !== "admin" && booking.userId !== caller.userId) {
      const [callerUser] = await db
        .select({ email: sql<string | null>`CASE WHEN email_verified_at IS NOT NULL THEN ${usersTable.email} ELSE NULL END` })
        .from(usersTable)
        .where(eq(usersTable.id, caller.userId));
      if (!callerUser?.email || booking.passengerEmail !== callerUser.email) {
        req.log.warn(
          {
            ip: req.ip,
            path: req.path,
            userId: caller.userId,
            role: caller.role,
          },
          "authorization_failed",
        );
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }

    if (!booking.driverId) {
      res.json({ available: false, reason: "no_driver" });
      return;
    }

    const ACTIVE_STATUSES = [
      "on_way",
      "on_location",
      "in_progress",
      "completed",
      "cancelled",
    ];
    const hoursUntilPickup =
      (new Date(booking.pickupAt).getTime() - Date.now()) / (1000 * 60 * 60);
    const withinWindow =
      hoursUntilPickup <= 48 || ACTIVE_STATUSES.includes(booking.status);

    if (!withinWindow) {
      res.json({
        available: false,
        reason: "too_early",
        hoursUntilPickup: Math.round(hoursUntilPickup),
      });
      return;
    }

    const [driver] = await db
      .select({
        name: driversTable.name,
        phone: driversTable.phone,
        vehicleYear: driversTable.vehicleYear,
        vehicleMake: driversTable.vehicleMake,
        vehicleModel: driversTable.vehicleModel,
        vehicleColor: driversTable.vehicleColor,
        regPlate: driversTable.regPlate,
        profilePicture: driversTable.profilePicture,
      })
      .from(driversTable)
      .where(eq(driversTable.id, booking.driverId));

    if (!driver) {
      res.json({ available: false, reason: "driver_not_found" });
      return;
    }

    // Prefer the vehicle the driver actually chose for THIS trip (multi-vehicle
    // drivers pick one at accept time); fall back to the legacy driver fields.
    let vehicleDescription = "";
    let regPlate: string | null = driver.regPlate ?? null;
    if (booking.selectedVehicleId != null) {
      const [selected] = await db
        .select({
          year: driverVehiclesTable.year,
          make: driverVehiclesTable.make,
          model: driverVehiclesTable.model,
          color: driverVehiclesTable.color,
          regPlate: driverVehiclesTable.regPlate,
        })
        .from(driverVehiclesTable)
        .where(eq(driverVehiclesTable.id, booking.selectedVehicleId));
      if (selected) {
        vehicleDescription = [
          selected.color,
          selected.year,
          selected.make,
          selected.model,
        ]
          .filter(Boolean)
          .join(" ");
        regPlate = selected.regPlate ?? regPlate;
      }
    }
    if (!vehicleDescription) {
      vehicleDescription =
        [
          driver.vehicleColor,
          driver.vehicleYear,
          driver.vehicleMake,
          driver.vehicleModel,
        ]
          .filter(Boolean)
          .join(" ") || "Luxury Vehicle";
    }

    res.json({
      available: true,
      driverName: driver.name,
      driverPhone: driver.phone,
      vehicleDescription,
      regPlate,
      // Signed here rather than by the client: the passenger does not own this
      // object, and letting them sign an arbitrary path would reopen access to
      // every driver's licence and insurance scan.
      profilePicture: signedObjectDownloadPath(driver.profilePicture),
    });
  },
);

// Authenticated single-booking endpoint
router.get("/bookings/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, params.data.id));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const caller = req.currentUser!;

  // Authenticated driver: can only access their own assigned bookings; receive driver-view (no priceQuoted)
  if (caller.role === "driver") {
    const [driverRow] = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.userId, caller.userId));
    if (!driverRow || booking.driverId !== driverRow.id) {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const commissionPct = await getCommissionPct();
    const extras = await loadExtrasFor(booking.id);
    const overtimeFares = await loadOverageFares([booking.id]);
    res.json({
      ...toDriverView(parseBooking(booking), commissionPct, {
        driverExtras: driverExtrasTotal(extras),
        overtimeFare:
          overtimeFares.get(booking.id) ??
          (parseFloat(String(booking.extraCharge ?? "0")) || 0),
      }),
      extras,
    });
    return;
  }

  // Passengers and corporate accounts: can only access their own bookings
  // Allow access if booking is linked by userId OR by matching passengerEmail
  if (caller.role === "passenger" || caller.role === "corporate") {
    if (booking.userId !== caller.userId) {
      // Check if email matches (covers admin-created bookings not yet linked by userId)
      const [callerUser] = await db
        .select({ email: sql<string | null>`CASE WHEN email_verified_at IS NOT NULL THEN ${usersTable.email} ELSE NULL END` })
        .from(usersTable)
        .where(eq(usersTable.id, caller.userId));
      if (!callerUser || booking.passengerEmail !== callerUser.email) {
        req.log.warn(
          {
            ip: req.ip,
            path: req.path,
            userId: req.currentUser?.userId,
            role: req.currentUser?.role,
          },
          "authorization_failed",
        );
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }
  }

  // For passengers/corporate: include existing rating if any
  if (
    caller.role === "passenger" ||
    caller.role === "corporate" ||
    caller.role === "admin"
  ) {
    const [existingReview] = await db
      .select({ rating: reviewsTable.rating, comment: reviewsTable.comment })
      .from(reviewsTable)
      .where(eq(reviewsTable.bookingId, params.data.id));
    const base = parseBooking(booking);
    // The stored receipt lines, so the passenger's receipt can print what was
    // actually charged instead of the 80/20 split it used to guess.
    const receipts = await loadBookingReceipts([booking.id]);
    res.json({
      ...base,
      extras: await loadExtrasFor(booking.id),
      receipt: receipts.get(booking.id) ?? null,
      hasRating: existingReview != null,
      existingRating: existingReview?.rating ?? null,
      existingComment: existingReview?.comment ?? null,
    });
    return;
  }

  res.json({
    ...parseBooking(booking),
    extras: await loadExtrasFor(booking.id),
  });
});

// GET /bookings/:id/flight-status — live flight status for bookings with a flight number.
// Accessible by the passenger (own booking), their assigned driver, and admins.
router.get(
  "/bookings/:id/flight-status",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const caller = req.currentUser!;
    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id));
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    // Access control: passenger (own booking), assigned driver, or admin
    if (caller.role === "passenger" || caller.role === "corporate") {
      if (booking.userId !== caller.userId) {
        const [callerUser] = await db
          .select({ email: sql<string | null>`CASE WHEN email_verified_at IS NOT NULL THEN ${usersTable.email} ELSE NULL END` })
          .from(usersTable)
          .where(eq(usersTable.id, caller.userId));
        if (!callerUser || booking.passengerEmail !== callerUser.email) {
          req.log.warn(
            {
              ip: req.ip,
              path: req.path,
              userId: req.currentUser?.userId,
              role: req.currentUser?.role,
            },
            "authorization_failed",
          );
          res.status(403).json({ error: "Access denied" });
          return;
        }
      }
    } else if (caller.role === "driver") {
      const [driverRow] = await db
        .select({ id: driversTable.id })
        .from(driversTable)
        .where(eq(driversTable.userId, caller.userId));
      if (!driverRow || booking.driverId !== driverRow.id) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    } else if (caller.role !== "admin") {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (!booking.flightNumber) {
      res.json({ available: false, reason: "no_flight_number" });
      return;
    }

    const { getFlightStatus, isFlightStatusConfigured } =
      await import("../lib/flightStatus.js");

    if (!isFlightStatusConfigured()) {
      res.json({
        available: false,
        reason: "not_configured",
        flightNumber: booking.flightNumber,
      });
      return;
    }

    const status = await getFlightStatus(booking.flightNumber);
    if (!status) {
      res.json({
        available: false,
        reason: "not_found",
        flightNumber: booking.flightNumber,
      });
      return;
    }

    res.json({ available: true, ...status });
  },
);

// GET /bookings/:id/driver-location — passenger-accessible live driver position.
// Only returns data when booking status is on_way or on_location and driver has shared coords.
router.get(
  "/bookings/:id/driver-location",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const caller = req.currentUser!;
    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id));
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    // Passengers: only their own bookings
    if (caller.role === "passenger" || caller.role === "corporate") {
      if (booking.userId !== caller.userId) {
        const [callerUser] = await db
          .select({ email: sql<string | null>`CASE WHEN email_verified_at IS NOT NULL THEN ${usersTable.email} ELSE NULL END` })
          .from(usersTable)
          .where(eq(usersTable.id, caller.userId));
        if (!callerUser || booking.passengerEmail !== callerUser.email) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
      }
    } else if (caller.role !== "admin") {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Only active while driver is on the way or on location
    if (!["on_way", "on_location"].includes(booking.status)) {
      res.json({ available: false, status: booking.status });
      return;
    }

    if (!booking.driverId) {
      res.json({ available: false, status: booking.status });
      return;
    }

    const [driver] = await db
      .select({
        latitude: driversTable.latitude,
        longitude: driversTable.longitude,
        locationUpdatedAt: driversTable.locationUpdatedAt,
        name: usersTable.name,
      })
      .from(driversTable)
      .innerJoin(usersTable, eq(driversTable.userId, usersTable.id))
      .where(eq(driversTable.id, booking.driverId));

    if (!driver?.latitude || !driver?.longitude) {
      res.json({
        available: false,
        status: booking.status,
        reason: "no_location",
      });
      return;
    }

    res.json({
      available: true,
      status: booking.status,
      lat: parseFloat(driver.latitude),
      lng: parseFloat(driver.longitude),
      driverName: driver.name,
      locationUpdatedAt: driver.locationUpdatedAt
        ? driver.locationUpdatedAt.toISOString()
        : null,
      pickupAddress: booking.pickupAddress,
      dropoffAddress: booking.dropoffAddress,
      pickupLat: null,
      pickupLng: null,
    });
  },
);

router.patch("/bookings/:id", requireAdmin, bookingAction(async (req, res): Promise<void> => {
  const params = UpdateBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [before] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, params.data.id));

  const updateData: Record<string, unknown> = {};
  if (parsed.data.status != null) updateData.status = parsed.data.status;
  if (parsed.data.driverId !== undefined)
    updateData.driverId = parsed.data.driverId;
  if (parsed.data.vehicleId !== undefined)
    updateData.vehicleId = parsed.data.vehicleId;
  if (parsed.data.specialRequests !== undefined)
    updateData.specialRequests = parsed.data.specialRequests;

  if(!before){res.status(404).json({error:'Booking not found'});return;}
  if(parsed.data.status==='cancelled'){res.status(409).json({error:'Use the cancellation action so refunds are recorded.'});return;}
  const booking=await withLock('driver-schedule:'+(updateData.driverId??before.driverId??'unassigned'),async tx=>{
    await setActor(tx,req.currentUser!.userId);
    const assigning=parsed.data.driverId!==undefined||parsed.data.vehicleId!==undefined;
    const nextDriverId=parsed.data.driverId!==undefined?parsed.data.driverId:before.driverId;
    if(assigning&&['cancelled','completed','in_progress'].includes(before.status))throw Object.assign(new Error('This trip cannot be reassigned'),{status:409});
    if(assigning&&nextDriverId!=null){
      const [driver]=await tx.select().from(driversTable).where(eq(driversTable.id,nextDriverId));
      if(!driver||driver.approvalStatus!=='approved'||driver.complianceHold)throw Object.assign(new Error('Select an approved, compliant driver'),{status:409});
      const windows=await tx.select().from(bookingsTable).where(and(eq(bookingsTable.driverId,nextDriverId),ne(bookingsTable.id,before.id),inArray(bookingsTable.status,[...ACTIVE_TRIP_STATUSES])));
      if(hasConflict(before,windows))throw Object.assign(new Error('Driver schedule conflict'),{status:409});
      if(parsed.data.vehicleId!=null){
        const [vehicle]=await tx.select().from(vehiclesTable).where(eq(vehiclesTable.id,parsed.data.vehicleId));
        if(!vehicle||vehicle.driverId!==nextDriverId||!vehicle.isAvailable||vehicle.vehicleClass!==before.vehicleClass||vehicle.capacity<before.passengers)throw Object.assign(new Error('The vehicle does not belong to this driver or cannot serve this trip'),{status:409});
        updateData.selectedVehicleId=null;
      }else if(nextDriverId!==before.driverId){
        const candidates=await tx.select().from(driverVehiclesTable).where(eq(driverVehiclesTable.driverId,nextDriverId));
        const vehicle=candidates.find(candidate=>vehicleFits(candidate,before));
        if(!vehicle)throw Object.assign(new Error('Driver has no vehicle with the required class and capacity'),{status:409});
        updateData.selectedVehicleId=vehicle.id;updateData.vehicleId=null;
      }
    }else if(assigning){
      if(parsed.data.vehicleId!=null)throw Object.assign(new Error('Assign a driver before selecting a vehicle'),{status:409});
      updateData.selectedVehicleId=null;updateData.vehicleId=null;
    }
    const [updated]=await tx.update(bookingsTable).set(updateData).where(and(eq(bookingsTable.id,params.data.id),eq(bookingsTable.status,before.status))).returning();if (updated && before.status !== "completed" && updated.status === "completed") {
      await recordTripCompletion(tx, updated);
    }
    return updated;
  });

  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }



  // Fire-and-forget: notify admin on status change
  if (before && parsed.data.status && before.status !== parsed.data.status) {
    await (async () => {
      try {
        await sendStatusChangedAdmin(
          booking.id,
          before.status,
          booking.status,
          booking.passengerName,
        );
      } catch (err) {
        console.error("[bookings] status change email error:", err);
      }
    })();

  }

  // Fire-and-forget: notify the driver when an admin directly assigns/reassigns them —
  // unlike the open-pool self-accept flow, a direct assignment has no other signal
  // that tells the driver a trip now exists for them.
  if (booking.driverId != null && before?.driverId !== booking.driverId) {
    const assignedDriverId = booking.driverId;
    await (async () => {
      try {
        const [driverUser] = await db
          .select({
            email: usersTable.email,
            pushToken: driversTable.pushToken,
            pushPlatform: driversTable.pushPlatform,
          })
          .from(driversTable)
          .innerJoin(usersTable, eq(driversTable.userId, usersTable.id))
          .where(eq(driversTable.id, assignedDriverId));
        if (!driverUser) return;

        const commissionPct = await getCommissionPct();
        const parsedBooking = parseBooking(booking);
        const driverEarnings = await driverEarningsForBooking(
          booking.id,
          parsedBooking.fareSubtotal,
          commissionPct,
        );
        const emailData = {
          ...parsedBooking,
          vehicleClass: parsedBooking.vehicleClass ?? "business",
          passengers: parsedBooking.passengers ?? 1,
          driverEarnings,
        };

        const results = await Promise.allSettled([
          sendBookingAssignedDriver(emailData, driverUser.email),
          sendDriverAssignedPush(
            {
              pushToken: driverUser.pushToken,
              pushPlatform: driverUser.pushPlatform,
            },
            {
              id: booking.id,
              pickupAddress: booking.pickupAddress,
              driverEarnings,
            },
          ),
        ]);
        for (const r of results) {
          if (r.status === "rejected")
            console.error(
              "[bookings] driver-assigned notification failed:",
              r.reason,
            );
        }
      } catch (err) {
        console.error("[bookings] driver-assigned notification error:", err);
      }
    })();
  }
  res.json(UpdateBookingResponse.parse(parseBooking(booking)));
}));

// Driver self-assigns a pending booking
router.post(
  "/bookings/:id/accept",
  requireAuth,
  bookingAction(async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const caller = req.currentUser!;
    if (caller.role !== "driver") {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
      res.status(403).json({ error: "Only drivers can accept bookings" });
      return;
    }

    const byUserId = await db
      .select({
        id: driversTable.id,
        approvalStatus: driversTable.approvalStatus,
        complianceHold: driversTable.complianceHold,
        status: driversTable.status,
        totalRides: driversTable.totalRides,
      })
      .from(driversTable)
      .where(eq(driversTable.userId, caller.userId))
      .orderBy(desc(driversTable.totalRides));
    const driverRow = byUserId[0];

    if (!driverRow) {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
      res.status(403).json({ error: "Driver not approved" });
      return;
    }

    // One shared test rather than a hand-written pair per gate. The suspension
    // set by the three-warning rule lives in `status`, which neither this route
    // nor the pool query used to read — a suspended driver kept full access while
    // being emailed that they had none.
    const blockReason = driverBlockReason(driverRow);
    if (blockReason) {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: caller.userId,
          driverId: driverRow.id,
          reason: blockReason,
        },
        "authorization_failed",
      );
      res
        .status(403)
        .json({ error: blockReason, message: driverBlockMessage(blockReason) });
      return;
    }

    // Hiding the trip from their pool is presentation; this is the control. A
    // driver who lost this booking for not confirming can still POST the id.
    const [blocked] = (await hasDriverBlockTable())
      ? await db
          .select({ id: bookingDriverBlocksTable.id })
          .from(bookingDriverBlocksTable)
          .where(
            and(
              eq(bookingDriverBlocksTable.bookingId, id),
              eq(bookingDriverBlocksTable.driverId, driverRow.id),
            ),
          )
      : [];
    if (blocked) {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: caller.userId,
          driverId: driverRow.id,
          bookingId: id,
        },
        "authorization_failed",
      );
      res
        .status(403)
        .json({ error: "This trip is no longer available to you." });
      return;
    }

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id));
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    // "confirmed" with no driver = corporate booking (created confirmed, no
    // payment step) still waiting for a driver to claim it.
    if (
      !["pending", "authorized", "confirmed"].includes(booking.status) ||
      booking.driverId != null
    ) {
      res
        .status(400)
        .json({ error: "Booking is already assigned or not available" });
      return;
    }

    // Service-area check, for the same reason as the block check above: filtering
    // the pool is presentation, and booking ids are sequential. Without this a
    // driver could take a trip three metros away simply by POSTing its id.
    const coverage = await loadZoneCoverage(driverRow.id);
    if (!isTripVisibleToDriver(await loadPickupPoint(booking.id), coverage)) {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: caller.userId,
          driverId: driverRow.id,
          bookingId: id,
        },
        "authorization_failed",
      );
      res
        .status(403)
        .json({ error: "This trip is outside your assigned service area." });
      return;
    }

    const isAuthorized = booking.status === "authorized";

    if (isAuthorized && !booking.stripePaymentIntentId) {
      res
        .status(400)
        .json({ error: "Booking has no payment intent to capture" });
      return;
    }

    // ── Scheduling conflict check ────────────────────────────────────────────────
    // Re-check busy windows even though the open-pool query already filtered them.
    // This guards against race conditions where a driver accepts another trip between
    // loading the list and tapping Accept.
    const busyWindows = await getDriverBusyWindows(driverRow.id);
    if (hasConflict(booking, busyWindows)) {
      res.status(409).json({
        error:
          "This trip conflicts with your existing schedule. You have another booking within 1 hour of this pickup time.",
        code: "SCHEDULE_CONFLICT",
      });
      return;
    }

    // Serialize by driver: a row-level CAS alone protects the booking, not the agenda.
    const result = await withLock('driver-schedule:'+driverRow.id, async tx => {
      await setActor(tx, caller.userId);
      const windows = await getDriverBusyWindows(driverRow.id,tx);
      if (hasConflict(booking,windows)) return {error:'This trip conflicts with your schedule',booking:null};
      const requestedVehicle=req.body?.vehicleId;
      if(requestedVehicle!=null && (!Number.isInteger(requestedVehicle)||requestedVehicle<=0))
        return {error:'Invalid vehicle',booking:null};
      const candidates=await tx.select().from(driverVehiclesTable).where(eq(driverVehiclesTable.driverId,driverRow.id));
      const vehicle=requestedVehicle!=null?candidates.find(v=>v.id===requestedVehicle):candidates.find(v=>vehicleFits(v,booking));
      if(!vehicle || !vehicleFits(vehicle,booking)) return {error:'Select one of your vehicles with the required class and capacity',booking:null};
      const [updated]=await tx.update(bookingsTable).set({driverId:driverRow.id,selectedVehicleId:vehicle.id,status:'confirmed'})
        .where(and(eq(bookingsTable.id,id),isNull(bookingsTable.driverId),inArray(bookingsTable.status,['pending','authorized','confirmed'])))
        .returning();
      return {error:updated?null:'Booking was taken or cancelled. Refresh your trips.',booking:updated??null};
    });
    if(!result.booking){res.status(409).json({error:result.error});return;}
    const updated=result.booking;

    // Accepting a trip is the act the per-trip terms attach to: the confirmation
    // deadline, the arrival obligation and the late-cancellation rule all become
    // binding at this moment, which is why it is recorded per booking rather than
    // once at onboarding.
    await recordAcceptance(req, {
      documentType: "trip_terms",
      bookingId: id,
      driverId: driverRow.id,
      userId: caller.userId,
    });

    // Step 2: For authorized bookings, attempt Stripe capture now that the assignment is recorded.
    // On capture failure: revert booking to awaiting_payment + unassign driver + alert admin.
    if (isAuthorized) {
      try {
        const stripe = getStripe();
        await stripe.paymentIntents.capture(booking.stripePaymentIntentId!,{}, {idempotencyKey:'accept-capture-'+booking.stripePaymentIntentId});
        // Capture succeeded — booking stays confirmed, continue to send emails below.
      } catch (stripeErr: any) {
        console.error(
          `[bookings] Stripe capture failed for booking #${id}:`,
          stripeErr.message,
        );
        // A timeout can occur after Stripe captured the funds. Reconcile before changing state.
        const actual=await getStripe().paymentIntents.retrieve(booking.stripePaymentIntentId!).catch(()=>null);
        if(actual?.status!=='succeeded'){
          const retryable=!actual||['requires_capture','processing'].includes(actual.status);
          await db.update(bookingsTable).set({driverId:null,vehicleId:null,status:retryable?'authorized':'awaiting_payment',
            authorizedAt:retryable?booking.authorizedAt:null,updatedAt:new Date()}).where(and(eq(bookingsTable.id,id),eq(bookingsTable.status,'confirmed')));
          res.status(retryable?503:402).json({error:retryable?'Payment confirmation is pending. Please retry acceptance shortly.':'Payment could not be captured. Please contact the admin.',captureError:true});
          return;
        }
      }
    }

    const commissionPct2 = await getCommissionPct();
    const parsedUpdated = parseBooking(updated);


    // Fire-and-forget emails
    await (async () => {
      try {
        const [driverUser] = await db
          .select({
            name: usersTable.name,
            email: usersTable.email,
            phone: driversTable.phone,
            vehicleYear: driversTable.vehicleYear,
            vehicleMake: driversTable.vehicleMake,
            vehicleModel: driversTable.vehicleModel,
            vehicleColor: driversTable.vehicleColor,
          })
          .from(usersTable)
          .innerJoin(driversTable, eq(driversTable.userId, usersTable.id))
          .where(eq(usersTable.id, caller.userId));
        const bookingEmailData = {
          ...parsedUpdated,
          vehicleClass: parsedUpdated.vehicleClass ?? "business",
          passengers: parsedUpdated.passengers ?? 1,
          driverEarnings: await driverEarningsForBooking(
            parsedUpdated.id,
            parsedUpdated.fareSubtotal,
            commissionPct2,
          ),
        };
        const vehicleDescription =
          [
            driverUser?.vehicleColor,
            driverUser?.vehicleYear,
            driverUser?.vehicleMake,
            driverUser?.vehicleModel,
          ]
            .filter(Boolean)
            .join(" ") || "Luxury Vehicle";

        const emailPromises: Promise<void>[] = [
          sendDriverAcceptedAdmin(
            bookingEmailData,
            driverUser?.name ?? "Driver",
            driverUser?.email ?? "",
          ),
          sendDriverAcceptedPassenger(
            bookingEmailData,
            driverUser?.name ?? "Driver",
            driverUser?.phone ?? "",
            vehicleDescription,
          ),
        ];

        // For authorized (captured) bookings, also fire the post-payment confirmation emails
        // since they were deferred at authorization time
        if (isAuthorized) {
          const pickupPoint = await loadPickupPoint(bookingEmailData.id);
          const notificationCandidates = await db
            .select({ id: driversTable.id, email: usersTable.email, pushToken: driversTable.pushToken, pushPlatform: driversTable.pushPlatform })
            .from(driversTable)
            .innerJoin(usersTable, eq(driversTable.userId, usersTable.id))
            .where(and(eq(driversTable.approvalStatus, "approved"), eq(driversTable.complianceHold, false)));
          const eligibleCandidates = (await Promise.all(notificationCandidates.map(async candidate => ({
            candidate,
            visible: isTripVisibleToDriver(pickupPoint, await loadZoneCoverage(candidate.id)),
          })))).filter(result => result.visible).map(result => result.candidate);
          const driverEmails = eligibleCandidates
            .map((d) => d.email)
            .filter(Boolean) as string[];
          const pushableDrivers = eligibleCandidates.filter(driver => driver.pushToken);
          emailPromises.push(
            sendBookingConfirmationPassenger(bookingEmailData),
            sendNewBookingAdmin(bookingEmailData),
            sendNewBookingAvailableToDrivers(bookingEmailData, driverEmails),
            sendNewRideOfferPush(pushableDrivers, {
              id: bookingEmailData.id,
              pickupAddress: bookingEmailData.pickupAddress,
              driverEarnings: bookingEmailData.driverEarnings,
            }),
          );
        }

        const results = await Promise.allSettled(emailPromises);
        for (const r of results) {
          if (r.status === "rejected")
            console.error("[bookings] accept notification failed:", r.reason);
        }
      } catch (err) {
        console.error("[bookings] accept email error:", err);
      }
    })();
    res.json(parsedUpdated);
  }),
);

// ─── Trip lifecycle endpoints (driver-only) ───────────────────────────────────

/**
 * Helper: verify the caller is the assigned driver for a booking.
 * Returns the driver DB row and booking row, or sends an error response.
 */
async function resolveAssignedDriver(
  req: import("express").Request,
  res: import("express").Response,
  bookingId: number,
): Promise<{
  booking: typeof bookingsTable.$inferSelect;
  driverRow: { id: number };
} | null> {
  const caller = req.currentUser!;
  if (caller.role !== "driver") {
    res.status(403).json({ error: "Only drivers can update trip status" });
    return null;
  }

  // ORDER BY total_rides DESC so we always get the canonical (most-active) record
  // when a driver has multiple records linked to the same userId.
  const driverRows = await db
    .select({ id: driversTable.id })
    .from(driversTable)
    .where(eq(driversTable.userId, caller.userId))
    .orderBy(desc(driversTable.totalRides));
  const driverRow = driverRows[0];

  if (!driverRow) {
    res.status(403).json({ error: "Driver profile not found" });
    return null;
  }

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return null;
  }

  if (booking.driverId !== driverRow.id) {
    res.status(403).json({ error: "You are not assigned to this booking" });
    return null;
  }

  return { booking, driverRow };
}

// POST /bookings/:id/trip/checklist
// Driver marks pre-ride checklist complete — required before En Route can activate
router.post(
  "/bookings/:id/trip/checklist",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const resolved = await resolveAssignedDriver(req, res, id);
    if (!resolved) return;
    const { booking } = resolved;

    if (!["confirmed", "on_way", "on_location"].includes(booking.status)) {
      res
        .status(400)
        .json({
          error: `Cannot complete checklist for booking in status: ${booking.status}`,
        });
      return;
    }

    const [updated] = await db
      .update(bookingsTable)
      .set({ checklistCompletedAt: new Date(), updatedAt: new Date() })
      .where(eq(bookingsTable.id, id))
      .returning();

    res.json({
      ok: true,
      checklistCompletedAt: updated.checklistCompletedAt?.toISOString() ?? null,
    });
  },
);

// POST /bookings/:id/trip/on-way
// Requires: caller = assigned driver, booking status = confirmed, pickup within 60 min
router.post(
  "/bookings/:id/trip/on-way",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const resolved = await resolveAssignedDriver(req, res, id);
    if (!resolved) return;
    const { booking } = resolved;

    if (booking.status !== "confirmed") {
      res
        .status(400)
        .json({ error: `Cannot mark on-way from status: ${booking.status}` });
      return;
    }

    // The window a driver may confirm in, and the deadline by which they must
    // have confirmed, are resolved together — they used to be the same 60 minutes
    // in two different files, which meant a driver could be stripped of the trip
    // a minute after becoming able to keep it. See lib/driverWindows.ts.
    const { confirmWindowMinutes } = await getDriverWindows();
    const minsUntilPickup =
      (new Date(booking.pickupAt).getTime() - Date.now()) / 60_000;
    if (minsUntilPickup > confirmWindowMinutes) {
      res.status(400).json({
        error: `On the Way can only be activated within ${confirmWindowMinutes} minutes of pickup`,
        minsUntilPickup: Math.round(minsUntilPickup),
        confirmWindowMinutes,
      });
      return;
    }

    const [updated] = await db
      .update(bookingsTable)
      .set({ status: "on_way", updatedAt: new Date() })
      .where(
        and(eq(bookingsTable.id, id), eq(bookingsTable.status, "confirmed")),
      )
      .returning();

    if (!updated) {
      res
        .status(409)
        .json({
          error:
            "Booking status has already changed — please refresh and try again.",
        });
      return;
    }

    res.json(parseBooking(updated));

    // Fire-and-forget: notify passenger via email + SMS
    (async () => {
      try {
        const b = parseBooking(booking);
        const [driverRow] = await db
          .select()
          .from(driversTable)
          .where(eq(driversTable.id, booking.driverId!));
        const vehicleDesc = driverRow
          ? `${driverRow.vehicleYear ?? ""} ${driverRow.vehicleMake ?? ""} ${driverRow.vehicleModel ?? ""}`.trim()
          : (booking.vehicleClass ?? "vehicle");
        await Promise.allSettled([
          sendDriverOnWay({
            ...b,
            vehicleClass: b.vehicleClass ?? "business",
            passengers: b.passengers ?? 1,
          }),
          sendDriverOnWaySms(
            booking.passengerPhone,
            driverRow?.name ?? "Your chauffeur",
            vehicleDesc,
          ),
        ]);
      } catch (err) {
        console.error("[bookings] on-way notification error:", err);
      }
    })();
  },
);

// POST /bookings/:id/trip/on-location
// Requires: caller = assigned driver, booking status = on_way
router.post(
  "/bookings/:id/trip/on-location",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const resolved = await resolveAssignedDriver(req, res, id);
    if (!resolved) return;
    const { booking } = resolved;

    if (booking.status !== "on_way") {
      res
        .status(400)
        .json({ error: `Cannot mark arrived from status: ${booking.status}` });
      return;
    }

    const [updated] = await db
      .update(bookingsTable)
      .set({ status: "on_location", updatedAt: new Date() })
      .where(and(eq(bookingsTable.id, id), eq(bookingsTable.status, "on_way")))
      .returning();

    if (!updated) {
      res
        .status(409)
        .json({
          error:
            "Booking status has already changed — please refresh and try again.",
        });
      return;
    }

    res.json(parseBooking(updated));

    // Fire-and-forget: notify passenger via email + SMS
    (async () => {
      try {
        const b = parseBooking(booking);
        const [driverRow] = await db
          .select()
          .from(driversTable)
          .where(eq(driversTable.id, booking.driverId!));
        await Promise.allSettled([
          sendDriverArrived({
            ...b,
            vehicleClass: b.vehicleClass ?? "business",
            passengers: b.passengers ?? 1,
          }),
          sendDriverArrivedSms(
            booking.passengerPhone,
            driverRow?.name ?? "Your chauffeur",
          ),
        ]);
      } catch (err) {
        console.error("[bookings] on-location notification error:", err);
      }
    })();
  },
);

// POST /bookings/:id/trip/start
// Requires: caller = assigned driver, booking status = on_location
router.post(
  "/bookings/:id/trip/start",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const resolved = await resolveAssignedDriver(req, res, id);
    if (!resolved) return;
    const { booking } = resolved;

    if (booking.status !== "on_location") {
      res
        .status(400)
        .json({ error: `Cannot start trip from status: ${booking.status}` });
      return;
    }

    // For hourly charters, freeze the rate/limit defaults onto the booking now so
    // the check-reservation-status cron has stable values to compute overage from,
    // even if pricing defaults change later.
    const hourlySetFields =
      booking.charterMode === "hourly"
        ? {
            hourlyRate:
              booking.hourlyRate ??
              String(HOURLY_RATES[booking.vehicleClass] ?? 95),
            maxMilesPerHour: booking.maxMilesPerHour ?? 30,
            extraMileRate:
              booking.extraMileRate ??
              String(DEFAULT_RATE_PER_MILE[booking.vehicleClass] ?? 3.5),
          }
        : {};

    const [updated] = await db
      .update(bookingsTable)
      .set({
        status: "in_progress",
        tripStartedAt: new Date(),
        updatedAt: new Date(),
        ...hourlySetFields,
      })
      .where(
        and(eq(bookingsTable.id, id), eq(bookingsTable.status, "on_location")),
      )
      .returning();

    if (!updated) {
      res
        .status(409)
        .json({
          error:
            "Booking status has already changed — please refresh and try again.",
        });
      return;
    }

    res.json(parseBooking(updated));
  },
);

// Hourly-charter progress is deliberately separate from booking.status so the
// existing in_progress timer keeps running while passengers are at a stop.
router.post(
  "/bookings/:id/trip/itinerary/:sequence/:action",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number(req.params["id"]);
    const sequence = Number(req.params["sequence"]);
    const action = String(req.params["action"] ?? "");
    if (!Number.isInteger(id) || !Number.isInteger(sequence) || sequence < 0 || !["arrive", "depart"].includes(action)) {
      res.status(400).json({ error: "Invalid itinerary action" });
      return;
    }

    const resolved = await resolveAssignedDriver(req, res, id);
    if (!resolved) return;
    const { booking, driverRow } = resolved;
    if (booking.charterMode !== "hourly" || booking.status !== "in_progress") {
      res.status(400).json({ error: "Itinerary actions require an hourly trip in progress" });
      return;
    }

    const itinerary = (await loadItineraries([id])).get(id) ?? [];
    const current = itinerary.find(stop => stop.sequence === sequence);
    if (!current) {
      res.status(404).json({ error: "Itinerary stop not found" });
      return;
    }
    const previous = itinerary.find(stop => stop.sequence === sequence - 1);
    if (previous && !previous.departedAt) {
      res.status(409).json({ error: "Complete the previous stop before continuing" });
      return;
    }

    const now = new Date();
    if (action === "arrive") {
      if (current.arrivedAt) {
        res.status(409).json({ error: "Arrival has already been recorded" });
        return;
      }
      await db.update(bookingItineraryStopsTable).set({ arrivedAt: now, arrivedByDriverId: driverRow.id, updatedAt: now })
        .where(and(eq(bookingItineraryStopsTable.id, current.id), isNull(bookingItineraryStopsTable.arrivedAt)));
    } else {
      if (current.kind === "final") {
        res.status(400).json({ error: "The final destination is completed with the Complete Trip action" });
        return;
      }
      if (!current.arrivedAt || current.departedAt) {
        res.status(409).json({ error: current.departedAt ? "Departure has already been recorded" : "Record arrival first" });
        return;
      }
      await db.update(bookingItineraryStopsTable).set({ departedAt: now, departedByDriverId: driverRow.id, updatedAt: now })
        .where(and(eq(bookingItineraryStopsTable.id, current.id), isNull(bookingItineraryStopsTable.departedAt)));
    }

    res.json({ ok: true, itinerary: (await loadItineraries([id])).get(id) ?? [] });
  },
);

// POST /bookings/:id/trip/complete
// Requires: caller = assigned driver, booking status = in_progress
router.post(
  "/bookings/:id/trip/complete",
  requireAuth,
  bookingAction(async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const resolved = await resolveAssignedDriver(req, res, id);
    if (!resolved) return;
    const { booking, driverRow } = resolved;

    if (booking.status === "completed") {
      res.json(parseBooking(booking));
      return;
    }
    if (booking.status !== "in_progress") {
      res
        .status(400)
        .json({ error: `Cannot complete trip from status: ${booking.status}` });
      return;
    }

    if (booking.charterMode === "hourly") {
      const itinerary = (await loadItineraries([id])).get(id) ?? [];
      const finalDestination = itinerary.find(stop => stop.kind === "final");
      if (!finalDestination?.arrivedAt) {
        res.status(409).json({ error: "Arrive at the final destination before completing this hourly trip" });
        return;
      }
    }

    // Hourly overage, computed here rather than by the cron that was planned and
    // never written. trip/start froze hourly_rate onto the row for exactly this.
    // The clock is the passenger's actual pickup (trip_started_at), so a driver
    // waiting at the kerb does not burn the block.
    //
    // Whole hours, never pro-rata. 21 minutes over costs a full hour and so does
    // 59 — that is the rule the customer is shown at booking and on the receipt.
    // The check-reservation-status edge function used to write a *pro-rata*
    // estimate onto extra_charge every minute a charter ran long, and the line
    // below preferred any existing value, so the estimate always won and the
    // customer was billed $32.16 where the quoted rule said $75.00.
    const endedAt = new Date();
    const overage = computeHourlyOverage({
      startedAt: booking.tripStartedAt,
      endedAt,
      contractedHours: booking.charterHours,
      hourlyRate:
        booking.hourlyRate != null
          ? parseFloat(String(booking.hourlyRate))
          : null,
    });

    // Extra time is taxed and carries the card fee, exactly like the fare. Only
    // `charge.fare` earns the chauffeur commission — they are not paid a share of
    // Florida's sales tax.
    const rates = await loadChargeRates();
    const charge = computePostTripCharge({
      fare: overage.extraCharge,
      taxRate: rates.taxRate,
      cardProcessingFeeRate: rates.cardProcessingFeeRate,
    });

    // A figure an administrator entered by hand from the booking screen is a
    // negotiated adjustment and still wins — but only when this booking has no
    // computed overage of its own, so a stale cron estimate can no longer shadow
    // the real one.
    const manualExtra = parseFloat(String(booking.extraCharge ?? "0")) || 0;
    const useManual = charge.total <= 0 && manualExtra > 0;
    const extraCharge = useManual ? manualExtra : charge.total;
    const totalPrice =
      Math.round(
        (parseFloat(String(booking.priceQuoted)) + extraCharge) * 100,
      ) / 100;

    const updated = await commitTripCompletion({
      bookingId: id, driverId: driverRow.id, endedAt, extraCharge, totalPrice,
      breakdown: !useManual && (overage.reason === "overage" || overage.overtimeMinutes > 0)
        ? { ...charge, minutes: overage.overtimeMinutes } : undefined,
    });

    if (!updated) {
      res
        .status(409)
        .json({
          error:
            "Booking status has already changed — please refresh and try again.",
        });
      return;
    }

    // Actually take the money. The charge was computed, stored and shown on the
    // receipt from the day the timer shipped, and never once presented to a card:
    // "extra time $32.16" was a label on a screen, not a transaction. Off-session
    // against the card the passenger already saved for this trip, and best-effort
    // — a completed trip must not be blocked by a declined incremental charge,
    // which dispatch can chase from the booking screen instead.
    let overagePaymentIntentId: string | null = null;
    if (!useManual && charge.total > 0) {
      const payment = await chargeExtraTime(
        updated,
        charge,
        overage.overtimeMinutes,
        true,
        req.log,
      );
      if (payment) {
        await settleOvertime(payment.operation, payment.paymentIntentId);
        overagePaymentIntentId = payment.paymentIntentId;
      }
    }

    res.json({ ...parseBooking(updated), overage, overageCharge: charge, overagePaymentIntentId });
  }),
);

/**
 * POST /bookings/:id/collect-extra-time — take payment for extra time that was
 * never collected.
 *
 * Two things need this. Trip completion charges the card off-session and does
 * not fail the chauffeur's "end trip" tap if the card declines, which leaves an
 * amount owed and, until now, no way at all to chase it. And every charter
 * completed before this shipped has an extra_charge that was computed, shown on
 * the receipt, and never presented to a card — booking #13 among them.
 *
 * The amount is RECOMPUTED here from the booking's own frozen inputs
 * (trip_started_at, trip_ended_at, charter_hours, hourly_rate) rather than read
 * from extra_charge, because on exactly those older rows extra_charge holds the
 * pro-rata figure the edge function used to write: $32.16 where the published
 * rule, the booking form and the passenger's own receipt all say the next whole
 * hour. Recomputing is what makes the stored row correct everywhere at once —
 * receipt, admin screen, chauffeur's earnings and the revenue report all read
 * these columns.
 *
 * Idempotent two ways: it refuses once a PaymentIntent is recorded, and the
 * Stripe call carries a fixed idempotency key per booking.
 */
router.post(
  "/bookings/:id/collect-extra-time",
  requireAdmin,
  bookingAction(async (req, res): Promise<void> => {
    // String(...) because Express 5 types params as string | string[]. Most of
    // this file predates that and carries the resulting type error; no reason to
    // add another.
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id));
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    if (booking.status !== "completed") {
      res
        .status(400)
        .json({
          error: `Extra time can only be collected on a completed trip (this one is ${booking.status}).`,
        });
      return;
    }

    const receipts = await loadBookingReceipts([id]);
    const existing = receipts.get(id);
    if (existing?.extraChargePaymentIntentId) {
      res.status(409).json({
        error: "The extra time on this booking has already been charged.",
        paymentIntentId: existing.extraChargePaymentIntentId,
      });
      return;
    }

    const operation = await loadOvertimeOperation(id);
    if (!operation) {
      res.status(409).json({error:'This historical trip needs payment reconciliation before collecting extra time.',code:'OVERTIME_RECONCILIATION_REQUIRED'});
      return;
    }

    const overage = computeHourlyOverage({
      startedAt: booking.tripStartedAt,
      endedAt: booking.tripEndedAt,
      contractedHours: booking.charterHours,
      hourlyRate:
        booking.hourlyRate != null
          ? parseFloat(String(booking.hourlyRate))
          : null,
    });

    const charge = operation.snapshot.charge;
    overage.overtimeMinutes = operation.snapshot.overtimeMinutes ?? overage.overtimeMinutes;

    if (charge.total <= 0) {
      res.status(400).json({
        error:
          overage.reason === "within_grace"
            ? `This charter ran ${overage.overtimeMinutes} minutes over, inside the ${OVERAGE_GRACE_MINUTES}-minute allowance. There is nothing to charge.`
            : "This charter has no billable extra time.",
        overage,
      });
      return;
    }

    const payment = await chargeExtraTime(
      booking,
      charge,
      overage.overtimeMinutes,
      false,
      req.log,
    );
    if (!payment) {
      res.status(402).json({
        error:
          "The card on file could not be charged. Check the passenger's saved payment method in Stripe, then try again.",
        amount: charge.total,
      });
      return;
    }

    const settled = await settleOvertime(payment.operation, payment.paymentIntentId);
    res.json({ ...settled, overage });

  }),
);

// ── Admin: add extras to an already-paid booking ────────────────────────────
//
// isPaidBooking() bookings lock the price-affecting fields on PATCH
// /admin/bookings/:id/details — an admin can't quietly change what a paid
// reservation costs. But "the passenger called back and wants a car seat" is
// not a change to the trip, it's money owed on top of it, and until now there
// was no way to record that at all: extras could only be chosen during initial
// booking. These two endpoints price a proposed add-on (no side effects) and
// then either charge it to the saved card off-session or, if there is none,
// raise a one-off Stripe invoice for just the difference — the same two
// payment paths the rest of this file already uses (collect-extra-time and
// create-invoice), applied to a mid-trip add-on instead.

const AddExtrasBody = z.object({
  extras: z
    .array(
      z.object({ id: z.number().int().positive(), quantity: z.number().int().positive().max(20).optional() }),
    )
    .min(1).max(20).refine(items=>new Set(items.map(e=>e.id)).size===items.length,"Duplicate extras are not allowed"),
});

/** Server-priced total for a proposed set of extras — never trust a client
 *  price. Shared by the preview and execute endpoints so they can never
 *  disagree on what something costs. */
async function priceAddonExtras(requested: Array<{ id: number; quantity?: number }>) {
  const services = await db
    .select({ id: extraServicesTable.id, name: extraServicesTable.name, price: extraServicesTable.price })
    .from(extraServicesTable)
    .where(
      and(
        inArray(extraServicesTable.id, requested.map((e) => e.id)),
        eq(extraServicesTable.isActive, true),
      ),
    );

  if(services.length!==requested.length)throw Object.assign(new Error('An extra is unavailable; refresh the selection'),{status:400});
  const priced = services.map((s) => ({
    id: s.id,
    name: s.name,
    quantity: requested.find((e) => e.id === s.id)?.quantity ?? 1,
    price: parseFloat(String(s.price)) || 0,
  }));

  const extrasTotal = Math.round(priced.reduce((sum, e) => sum + e.price * e.quantity, 0) * 100) / 100;
  const rates = await loadChargeRates();
  const charge = computePostTripCharge({ fare: extrasTotal, taxRate: rates.taxRate, cardProcessingFeeRate: rates.cardProcessingFeeRate });

  return { priced, charge };
}

/** Does this booking have a saved card that can be charged off-session? Same
 *  requirement chargeExtraTime() checks for the extra-time collection flow. */
async function findCardOnFile(userId: number | null): Promise<{ stripeCustomerId: string; defaultPaymentMethodId: string } | null> {
  if (userId == null) return null;
  const [user] = await db
    .select({ stripeCustomerId: usersTable.stripeCustomerId, defaultPaymentMethodId: usersTable.defaultPaymentMethodId })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user?.stripeCustomerId || !user.defaultPaymentMethodId) return null;
  return { stripeCustomerId: user.stripeCustomerId, defaultPaymentMethodId: user.defaultPaymentMethodId };
}

router.post(
  "/admin/bookings/:id/extras/preview",
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid booking id" }); return; }

    const parsed = AddExtrasBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: z.prettifyError(parsed.error) }); return; }

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

    const { priced, charge } = await priceAddonExtras(parsed.data.extras);
    const card = await findCardOnFile(booking.userId);

    res.json({
      extras: priced,
      extrasTotal: charge.fare,
      taxAmount: charge.taxAmount,
      cardProcessingFee: charge.cardProcessingFee,
      total: charge.total,
      hasCardOnFile: card != null,
    });
  },
);

router.post(
  "/admin/bookings/:id/extras",
  requireAdmin,
  bookingAction(async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid booking id" }); return; }

    const parsed = AddExtrasBody.extend({
      method: z.enum(["card", "invoice"]),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: z.prettifyError(parsed.error) }); return; }

    const key=req.get('Idempotency-Key');
    if(!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key)){res.status(400).json({error:'A stable Idempotency-Key is required. Refresh the form and retry.'});return;}
    const operationId='addon:'+req.currentUser!.userId+':'+key;
    const hash=addonRequestHash(parsed.data.method,parsed.data.extras);
    let operation=await loadAddonOperation(operationId,id,hash);
    if(operation?.response){res.json({...operation.response,extras:await loadExtrasFor(id)});return;}
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    if (booking.status === "cancelled") {
      res.status(400).json({ error: "This booking is cancelled." });
      return;
    }
    if (!isPaidBooking(booking)) {
      res.status(400).json({
        error: "This booking hasn't been paid yet — edit it normally and the fare (including extras) will be recomputed before payment is collected.",
      });
      return;
    }

    const snapshot=operation?.snapshot ?? await priceAddonExtras(parsed.data.extras);
    const {priced,charge}=snapshot;
    if (!priced.length || charge.total <= 0) {
      res.status(400).json({ error: "Nothing billable was selected." });
      return;
    }
    if(!operation)operation=await createAddonOperation(operationId,id,hash,snapshot);
    const extraNames = priced.map((e) => (e.quantity > 1 ? `${e.name} ×${e.quantity}` : e.name));
    const bookingRef = `RM-${String(id).padStart(4, "0")}`;

    let paymentIntentId: string | null = null;
    let invoiceUrl: string | null = null;
    let invoicePdfUrl: string | null = null;

    const stripe=getStripe();
    if(parsed.data.method==='card')paymentIntentId=await payAddonCard(stripe,operation,await findCardOnFile(booking.userId));
    else ({invoiceUrl,invoicePdfUrl}=await invoiceAddon(stripe,operation,{email:booking.passengerEmail,name:booking.passengerName}));

    const result=await db.transaction(async tx=>{
      await tx.insert(bookingExtrasTable).values(priced.map(e=>({bookingId:id,extraServiceId:e.id,quantity:e.quantity,priceAtBooking:String(e.price)})));
      const [updated]=await tx.update(bookingsTable).set({
        priceQuoted:sql`${bookingsTable.priceQuoted} + ${charge.total}`,
        totalPrice:sql`CASE WHEN ${bookingsTable.totalPrice} IS NULL THEN NULL ELSE ${bookingsTable.totalPrice} + ${charge.total} END`,
        updatedAt:new Date(),
      }).where(eq(bookingsTable.id,id)).returning();
      if(!updated)throw new Error('Booking vanished after payment; operation remains recoverable');
      await tx.execute(sql`UPDATE bookings SET extras_total=coalesce(extras_total,0)+${charge.fare},
        tax_amount=coalesce(tax_amount,0)+${charge.taxAmount},card_fee=coalesce(card_fee,0)+${charge.cardProcessingFee} WHERE id=${id}`);
      await withMailScope(operationId,()=>withMailTransaction(tx,async()=>{
        if(parsed.data.method==='card')await sendAddonExtrasChargedEmail({bookingId:id,passengerName:booking.passengerName,
          passengerEmail:booking.passengerEmail,extraNames,fare:charge.fare,taxAmount:charge.taxAmount,cardProcessingFee:charge.cardProcessingFee,total:charge.total});
        else if(invoiceUrl)await sendAddonInvoiceToPassenger({bookingId:id,passengerName:booking.passengerName,
          passengerEmail:booking.passengerEmail,extraNames,total:charge.total,invoiceUrl,invoicePdfUrl});
      }));
      const response={ok:true,booking:parseBooking(updated),method:parsed.data.method,paymentIntentId,invoiceUrl,charge};
      await tx.execute(sql`UPDATE booking_adjustments SET response=${JSON.stringify(response)}::jsonb,applied_at=now() WHERE id=${operationId}`);
      return response;
    });
    res.json({...result,extras:await loadExtrasFor(id)});
  }),
);

// Admin: unassign driver from a booking (puts it back in the open pool)
router.post(
  "/bookings/:id/unassign",
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const [existing] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    if (!existing.driverId) {
      res.status(400).json({ error: "Booking has no driver assigned" });
      return;
    }

    const prevDriverId = existing.driverId;

    const [updated] = await db
      .update(bookingsTable)
      .set({ driverId: null, status: "pending" })
      .where(eq(bookingsTable.id, id))
      .returning();

    res.json(parseBooking(updated));

    // Fire-and-forget: notify admin
    (async () => {
      try {
        const [driverUser] = await db
          .select({ name: usersTable.name })
          .from(driversTable)
          .innerJoin(usersTable, eq(driversTable.userId, usersTable.id))
          .where(eq(driversTable.id, prevDriverId));
        await sendDriverUnassignedAdmin(
          id,
          driverUser?.name ?? `Driver #${prevDriverId}`,
          existing.passengerName,
        );
      } catch (err) {
        console.error("[bookings] unassign email error:", err);
      }
    })();
  },
);

// ─── Cancel preview — returns fee info without cancelling ─────────────────────

router.get(
  "/bookings/:id/cancel-preview",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (!id) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id));
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    const caller = req.currentUser!;
    if (caller.role !== "admin" && booking.userId !== caller.userId) {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const priceQuoted = parseFloat(String(booking.priceQuoted));
    const policy = getCancellationPolicy(
      booking.pickupAt,
      priceQuoted,
      booking.status,
    );
    res.json(policy);
  },
);

// ─── Cancel booking ───────────────────────────────────────────────────────────

router.delete("/bookings/:id",requireAuth,async(req,res):Promise<void>=>{
 const params=CancelBookingParams.safeParse(req.params);
 if(!params.success){res.status(400).json({error:'Invalid booking id'});return;}
 const caller=req.currentUser!;
 const result=await withLock('payment:'+params.data.id,async tx=>{
  await setActor(tx,caller.userId);
  const [booking]=await tx.select().from(bookingsTable).where(eq(bookingsTable.id,params.data.id));
  if(!booking)return {status:404,body:{error:'Booking not found'}};
  if(caller.role!=='admin'&&booking.userId!==caller.userId)return {status:403,body:{error:'Access denied'}};
  if(booking.status==='cancelled')return {status:200,body:{success:true}};
  if(['completed','in_progress'].includes(booking.status))return {status:409,body:{error:'This booking cannot be cancelled.'}};
  const policy=getCancellationPolicy(booking.pickupAt,Number(booking.priceQuoted),booking.status);
  const [cancelled]=await tx.update(bookingsTable).set({status:'cancelled',cancelledAt:new Date(),cancelledBy:caller.role,updatedAt:new Date()})
   .where(and(eq(bookingsTable.id,booking.id),eq(bookingsTable.status,booking.status))).returning();
  if(!cancelled)return {status:409,body:{error:'The trip changed. Refresh before cancelling.'}};
  if(booking.promoCode)await tx.update(promoCodesTable).set({usedCount:sql`greatest(0,${promoCodesTable.usedCount}-1)`}).where(eq(promoCodesTable.code,booking.promoCode));
  const payload={intentId:booking.stripePaymentIntentId,refundCents:Math.round(policy.netRefund*100),feeAmount:policy.feeAmount};
  await tx.execute(sql`INSERT INTO app_jobs(key,kind,booking_id,payload) VALUES(${'booking-cancellation:'+booking.id},'booking-cancellation',${booking.id},${JSON.stringify(payload)}::jsonb) ON CONFLICT DO NOTHING`);
  return {status:200,body:{success:true,feePercent:policy.feePercent,feeAmount:policy.feeAmount,netRefund:policy.netRefund,settlementStatus:'queued'}};
 });
 res.status(result.status).json(result.body);
});

// ─── Passenger: rate a driver after trip completion ──────────────────────────

router.post(
  "/bookings/:id/rate",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid booking id" });
      return;
    }

    const { rating, comment } = req.body as {
      rating?: number;
      comment?: string;
    };
    if (!rating || rating < 1 || rating > 5) {
      res.status(400).json({ error: "Rating must be between 1 and 5" });
      return;
    }

    const caller = req.currentUser!;

    const [booking] = await db
      .select({
        id: bookingsTable.id,
        status: bookingsTable.status,
        userId: bookingsTable.userId,
        driverId: bookingsTable.driverId,
      })
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id));

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    // Only the passenger who booked this ride can rate it
    if (booking.userId !== caller.userId) {
      req.log.warn(
        {
          ip: req.ip,
          path: req.path,
          userId: req.currentUser?.userId,
          role: req.currentUser?.role,
        },
        "authorization_failed",
      );
      res.status(403).json({ error: "You can only rate your own rides" });
      return;
    }

    if (booking.status !== "completed") {
      res.status(400).json({ error: "You can only rate a completed trip" });
      return;
    }

    if (!booking.driverId) {
      res.status(400).json({ error: "No driver assigned to this booking" });
      return;
    }

    // Prevent duplicate ratings
    const [existing] = await db
      .select({ id: reviewsTable.id })
      .from(reviewsTable)
      .where(eq(reviewsTable.bookingId, id));
    if (existing) {
      res.status(409).json({ error: "You have already rated this trip" });
      return;
    }

    const [review] = await db
      .insert(reviewsTable)
      .values({
        bookingId: id,
        driverId: booking.driverId,
        userId: caller.userId,
        rating,
        comment: comment ?? null,
      })
      .returning();

    res.json({ success: true, reviewId: review.id });

    // Recompute and persist driver's average rating (fire-and-forget).
    // Note: this used to run twice with different rounding (merge artifact from
    // two parallel sessions) — deduplicated to this single pass.
    const driverId = booking.driverId;
    db.select({ avg: sql<string>`avg(rating)::numeric(3,2)` })
      .from(reviewsTable)
      .where(eq(reviewsTable.driverId, driverId))
      .then(([row]) => {
        if (row?.avg != null) {
          return db
            .update(driversTable)
            .set({ rating: row.avg })
            .where(eq(driversTable.id, driverId));
        }
        return undefined;
      })
      .catch((err) =>
        console.error("[bookings] failed to update driver rating:", err),
      );
  },
);

export default router;

