import { Router, type IRouter } from "express";
import { eq, ne, desc, or, and, isNull, isNotNull, inArray } from "drizzle-orm";
import { db, usersTable, bookingsTable, userFavoriteDriversTable, driversTable, managedTravelersTable } from "@workspace/db";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { ensureUniqueReferralCode, fetchReferralCreditAmount } from "../lib/referrals.js";
import { serializeBooking } from "../lib/serializeBooking.js";
import { loadBookingExtras } from "../lib/bookingExtras.js";
import {
  ListUsersQueryParams,
  ListUsersResponse,
  CreateUserBody,
  GetUserParams,
  GetUserResponse,
  UpdateUserParams,
  UpdateUserBody,
  UpdateUserResponse,
  GetUserBookingsParams,
  GetUserBookingsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseUser(u: typeof usersTable.$inferSelect) {
  return { ...u, createdAt: u.createdAt.toISOString() };
}

// Admin-only: list all users (used by admin passengers/drivers pages)
router.get("/users", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListUsersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const users = await db
    .select()
    .from(usersTable)
    .where(parsed.data.role ? eq(usersTable.role, parsed.data.role) : undefined);

  res.json(ListUsersResponse.parse(users.map(parseUser)));
});

// Admin-only: create a user directly (prefer /auth/register for self-signup)
router.post("/users", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db.insert(usersTable).values(parsed.data).returning();
  res.status(201).json(GetUserResponse.parse(parseUser(user)));
});

// Auth: self or admin
router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== params.data.id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(GetUserResponse.parse(parseUser(user)));
});

// Auth: self or admin; only name and phone can be updated (email is identity)
router.patch("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== params.data.id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name != null) updateData.name = parsed.data.name;
  if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
  // Cabin preference fields — all optional, nulls explicitly allowed to clear them
  const body = req.body as Record<string, unknown>;

  // Email — admin only. It is the passenger's login and their bookings are
  // matched by it (see GET /users/:id/bookings, which unions on
  // passengerEmail), so a passenger changing their own would silently orphan
  // their history. Admins genuinely need it for typos taken over the phone.
  // Checked for collision first: users.email is unique, and letting the
  // constraint fire would surface as an opaque 500.
  if ("email" in body && caller.role === "admin") {
    const raw = body["email"];
    if (typeof raw !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())) {
      res.status(400).json({ error: "Enter a valid email address." });
      return;
    }
    const nextEmail = raw.trim().toLowerCase();
    const clashing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.email, nextEmail), ne(usersTable.id, params.data.id)));
    if (clashing.length > 0) {
      res.status(409).json({ error: "Another account already uses that email address." });
      return;
    }
    updateData.email = nextEmail;
  }

  if ("cabinTempF" in body) updateData.cabinTempF = body["cabinTempF"] ?? null;
  if ("musicPreference" in body) updateData.musicPreference = body["musicPreference"] ?? null;
  if ("quietRide" in body) updateData.quietRide = !!body["quietRide"];
  if ("preferredBeverage" in body) updateData.preferredBeverage = body["preferredBeverage"] ?? null;
  if ("opensOwnDoor" in body) updateData.opensOwnDoor = !!body["opensOwnDoor"];
  if ("addressTitle" in body) updateData.addressTitle = body["addressTitle"] ?? null;
  // VIP notes — admin only
  if ("vipNotes" in body && caller.role === "admin") {
    updateData.vipNotes = body["vipNotes"] ?? null;
  }

  const [user] = await db
    .update(usersTable)
    .set(updateData)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(UpdateUserResponse.parse(parseUser(user)));
});

// Auth: self or admin
router.get("/users/:id/bookings", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserBookingsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== params.data.id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  // Fetch the user so we can also match bookings by passengerEmail
  const [user] = await db.select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Return bookings linked by userId OR unlinked bookings matched by passengerEmail
  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(
      or(
        eq(bookingsTable.userId, user.id),
        and(eq(bookingsTable.passengerEmail, user.email), isNull(bookingsTable.userId))
      )
    )
    .orderBy(desc(bookingsTable.createdAt));

  // Retroactively link any email-matched bookings that have no userId yet
  const unlinked = bookings.filter(b => !b.userId);
  if (unlinked.length > 0) {
    db.update(bookingsTable)
      .set({ userId: user.id })
      .where(
        and(eq(bookingsTable.passengerEmail, user.email), isNull(bookingsTable.userId))
      )
      .catch(err => console.error("[users] retroactive link error:", err));
  }

  // This mapping used to be a third local copy that never learned to parse
  // fare_subtotal, so the response schema rejected every booking that had one
  // and the passenger's "My Rides" page — upcoming and past alike — showed
  // nothing at all. See lib/serializeBooking.ts.
  //
  // The validated shape is then RE-EXTENDED, because zod object parsing strips
  // unknown keys: every field not in the generated contract — the charter
  // terms, the add-ons, the overtime — was being validated away here before it
  // could reach the browser. That is why the passenger dashboard and My Rides
  // showed neither "hourly" nor the extras while the driver portal, which does
  // not go through a generated schema, showed both. Validating the contract and
  // then adding to it keeps the contract honest without making it the ceiling.
  const validated = GetUserBookingsResponse.parse(bookings.map(serializeBooking));
  const extrasByBooking = await loadBookingExtras(bookings.map(b => b.id));
  const byId = new Map(bookings.map(b => [b.id, serializeBooking(b)]));

  res.json(
    validated.map(v => {
      const full = byId.get(v.id);
      return {
        ...v,
        extras: extrasByBooking.get(v.id) ?? [],
        charterMode: full?.charterMode ?? null,
        charterHours: full?.charterHours ?? null,
        maxMilesPerHour: full?.maxMilesPerHour ?? null,
        hourlyRate: full?.hourlyRate ?? null,
        extraCharge: full?.extraCharge ?? 0,
        tripStartedAt: full?.tripStartedAt ?? null,
        status: full?.status ?? v.status,
      };
    }),
  );
});

// ─── Referral program ─────────────────────────────────────────────────────────

// GET /users/:id/referral — this user's own shareable referral code/link (self or admin)
router.get("/users/:id/referral", requireAuth, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== userId) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  let referralCode = user.referralCode;
  if (!referralCode) {
    referralCode = await ensureUniqueReferralCode(user.name);
    await db.update(usersTable).set({ referralCode }).where(eq(usersTable.id, userId));
  }

  const referredUsers = await db
    .select({ id: usersTable.id, rewardedAt: usersTable.referralRewardedAt })
    .from(usersTable)
    .where(eq(usersTable.referredByUserId, userId));

  const creditAmount = await fetchReferralCreditAmount();
  const APP_URL = process.env.APP_URL ?? "https://royalmidnight.com";

  res.json({
    referralCode,
    referralLink: `${APP_URL}/book?ref=${referralCode}`,
    creditAmount,
    referredCount: referredUsers.length,
    rewardedCount: referredUsers.filter(r => r.rewardedAt != null).length,
  });
});

// GET /admin/affiliates — every referral relationship, for admin oversight of the referral program
router.get("/admin/affiliates", requireAdmin, async (_req, res): Promise<void> => {
  const referredRows = await db
    .select({
      refereeId: usersTable.id,
      refereeName: usersTable.name,
      refereeEmail: usersTable.email,
      refereeCreatedAt: usersTable.createdAt,
      referrerId: usersTable.referredByUserId,
      rewardedAt: usersTable.referralRewardedAt,
    })
    .from(usersTable)
    .where(isNotNull(usersTable.referredByUserId))
    .orderBy(desc(usersTable.createdAt));

  const referrerIds = [...new Set(referredRows.map(r => r.referrerId).filter((id): id is number => id != null))];
  const referrers = referrerIds.length
    ? await db
        .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, referralCode: usersTable.referralCode })
        .from(usersTable)
        .where(inArray(usersTable.id, referrerIds))
    : [];
  const referrerById = new Map(referrers.map(r => [r.id, r]));

  const creditAmount = await fetchReferralCreditAmount();

  const referrals = referredRows.map(r => {
    const referrer = r.referrerId != null ? referrerById.get(r.referrerId) : undefined;
    return {
      refereeId: r.refereeId,
      refereeName: r.refereeName,
      refereeEmail: r.refereeEmail,
      refereeCreatedAt: r.refereeCreatedAt.toISOString(),
      referrerId: r.referrerId,
      referrerName: referrer?.name ?? "Unknown",
      referrerEmail: referrer?.email ?? "",
      referrerCode: referrer?.referralCode ?? null,
      rewarded: r.rewardedAt != null,
      rewardedAt: r.rewardedAt ? r.rewardedAt.toISOString() : null,
    };
  });

  const byReferrer = new Map<number, { referrerId: number; referrerName: string; referrerEmail: string; referralCode: string | null; referredCount: number; rewardedCount: number }>();
  for (const r of referrals) {
    if (r.referrerId == null) continue;
    const entry = byReferrer.get(r.referrerId) ?? {
      referrerId: r.referrerId,
      referrerName: r.referrerName,
      referrerEmail: r.referrerEmail,
      referralCode: r.referrerCode,
      referredCount: 0,
      rewardedCount: 0,
    };
    entry.referredCount += 1;
    if (r.rewarded) entry.rewardedCount += 1;
    byReferrer.set(r.referrerId, entry);
  }

  const rewardedCount = referrals.filter(r => r.rewarded).length;

  res.json({
    creditAmount,
    totals: {
      totalReferrers: byReferrer.size,
      totalReferred: referrals.length,
      totalRewarded: rewardedCount,
      totalRewardedAmount: Math.round(rewardedCount * creditAmount * 100) / 100,
    },
    topReferrers: [...byReferrer.values()].sort((a, b) => b.referredCount - a.referredCount),
    referrals,
  });
});

// ─── Favorite Drivers ─────────────────────────────────────────────────────────

// GET /users/:id/favorite-drivers — list saved drivers (self or admin)
router.get("/users/:id/favorite-drivers", requireAuth, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== userId) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const rows = await db
    .select({
      driverId: userFavoriteDriversTable.driverId,
      driverName: driversTable.name,
      profilePicture: driversTable.profilePicture,
      vehicleMake: driversTable.vehicleMake,
      vehicleModel: driversTable.vehicleModel,
      vehicleYear: driversTable.vehicleYear,
      rating: driversTable.rating,
      createdAt: userFavoriteDriversTable.createdAt,
    })
    .from(userFavoriteDriversTable)
    .leftJoin(driversTable, eq(driversTable.id, userFavoriteDriversTable.driverId))
    .where(eq(userFavoriteDriversTable.userId, userId));

  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

// POST /users/:id/favorite-drivers/:driverId — save a driver as favourite
router.post("/users/:id/favorite-drivers/:driverId", requireAuth, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["id"] ?? ""), 10);
  const driverId = parseInt(String(req.params["driverId"] ?? ""), 10);
  if (isNaN(userId) || isNaN(driverId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== userId) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  // Upsert — silently succeed if already saved
  await db
    .insert(userFavoriteDriversTable)
    .values({ userId, driverId })
    .onConflictDoNothing();

  res.json({ ok: true });
});

// DELETE /users/:id/favorite-drivers/:driverId — remove a saved driver
router.delete("/users/:id/favorite-drivers/:driverId", requireAuth, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params["id"] ?? ""), 10);
  const driverId = parseInt(String(req.params["driverId"] ?? ""), 10);
  if (isNaN(userId) || isNaN(driverId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== userId) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  await db
    .delete(userFavoriteDriversTable)
    .where(and(eq(userFavoriteDriversTable.userId, userId), eq(userFavoriteDriversTable.driverId, driverId)));

  res.json({ ok: true });
});

// ── Delegate / EA managed traveler routes ────────────────────────────────────

// GET /users/:id/managed-travelers — list travelers this EA can book for
router.get("/users/:id/managed-travelers", requireAuth, async (req, res): Promise<void> => {
  const eaUserId = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(eaUserId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== eaUserId) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const rows = await db.select().from(managedTravelersTable)
    .where(eq(managedTravelersTable.eaUserId, eaUserId));

  res.json(rows);
});

// POST /users/:id/managed-travelers — add a traveler by email
router.post("/users/:id/managed-travelers", requireAuth, async (req, res): Promise<void> => {
  const eaUserId = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(eaUserId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== eaUserId) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const { email } = req.body as { email?: string };
  if (!email?.trim()) { res.status(400).json({ error: "email is required" }); return; }

  const [traveler] = await db.select().from(usersTable).where(eq(usersTable.email, email.trim().toLowerCase()));
  if (!traveler) { res.status(404).json({ error: "No account found with that email" }); return; }
  if (traveler.id === eaUserId) { res.status(400).json({ error: "Cannot add yourself as a traveler" }); return; }

  await db.insert(managedTravelersTable).values({
    eaUserId,
    travelerId: traveler.id,
    travelerName: traveler.name,
    travelerEmail: traveler.email,
  }).onConflictDoNothing();

  res.status(201).json({ eaUserId, travelerId: traveler.id, travelerName: traveler.name, travelerEmail: traveler.email });
});

// DELETE /users/:id/managed-travelers/:travelerId — remove a traveler link
router.delete("/users/:id/managed-travelers/:travelerId", requireAuth, async (req, res): Promise<void> => {
  const eaUserId = parseInt(String(req.params["id"] ?? ""), 10);
  const travelerId = parseInt(String(req.params["travelerId"] ?? ""), 10);
  if (isNaN(eaUserId) || isNaN(travelerId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const caller = req.currentUser!;
  if (caller.role !== "admin" && caller.userId !== eaUserId) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  await db.delete(managedTravelersTable)
    .where(and(eq(managedTravelersTable.eaUserId, eaUserId), eq(managedTravelersTable.travelerId, travelerId)));

  res.json({ ok: true });
});

export default router;
