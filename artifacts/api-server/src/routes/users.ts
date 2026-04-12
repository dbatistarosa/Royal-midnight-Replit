import { Router, type IRouter } from "express";
import { eq, desc, or, and, isNull } from "drizzle-orm";
import { db, usersTable, bookingsTable, userFavoriteDriversTable, driversTable } from "@workspace/db";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
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

  res.json(
    GetUserBookingsResponse.parse(
      bookings.map((b) => ({
        ...b,
        priceQuoted: parseFloat(b.priceQuoted ?? "0"),
        discountAmount: b.discountAmount != null ? parseFloat(b.discountAmount) : null,
        pickupAt: b.pickupAt.toISOString(),
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      }))
    )
  );
});

// ─── Favorite Drivers ─────────────────────────────────────────────────────────

// GET /users/:id/favorite-drivers — list saved drivers (self or admin)
router.get("/users/:id/favorite-drivers", requireAuth, async (req, res): Promise<void> => {
  const userId = parseInt(req.params["id"] ?? "", 10);
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
  const userId = parseInt(req.params["id"] ?? "", 10);
  const driverId = parseInt(req.params["driverId"] ?? "", 10);
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
  const userId = parseInt(req.params["id"] ?? "", 10);
  const driverId = parseInt(req.params["driverId"] ?? "", 10);
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

export default router;
