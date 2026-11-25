import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, reviewsTable, bookingsTable, driversTable } from "@workspace/db";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import {
  ListReviewsQueryParams,
  CreateReviewBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/reviews", optionalAuth, async (req, res): Promise<void> => {
  const parsed = ListReviewsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Filtering by booking ties a review to a specific ride, so only that
  // booking's passenger or an admin may do it. Anyone else gets an empty list
  // — the same answer as a booking with no review, so nothing is revealed.
  if (parsed.data.bookingId != null) {
    const caller = req.currentUser;
    if (!caller) {
      res.json([]);
      return;
    }
    if (caller.role !== "admin") {
      const [owned] = await db
        .select({ id: bookingsTable.id })
        .from(bookingsTable)
        .where(and(eq(bookingsTable.id, parsed.data.bookingId), eq(bookingsTable.userId, caller.userId)));
      if (!owned) {
        res.json([]);
        return;
      }
    }
  }

  const conditions = [];
  if (parsed.data.driverId != null) conditions.push(eq(reviewsTable.driverId, parsed.data.driverId));
  if (parsed.data.bookingId != null) conditions.push(eq(reviewsTable.bookingId, parsed.data.bookingId));

  // This endpoint is public. Returning whole rows meant userId and bookingId
  // came with every review, which is enough to correlate which passenger rode
  // with which chauffeur and when. Only the fields a rating list actually
  // renders leave the server.
  const reviews = await db
    .select({
      id: reviewsTable.id,
      driverId: reviewsTable.driverId,
      rating: reviewsTable.rating,
      comment: reviewsTable.comment,
      createdAt: reviewsTable.createdAt,
    })
    .from(reviewsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json(reviews.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/reviews", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Verify the booking belongs to the caller and is completed
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, parsed.data.bookingId));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (req.currentUser!.role !== "admin" && booking.userId !== req.currentUser!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (booking.status !== "completed") {
    res.status(400).json({ error: "Reviews can only be submitted for completed rides" });
    return;
  }

  const [review] = await db.insert(reviewsTable).values({ ...parsed.data, userId: req.currentUser!.userId }).returning();

  // Recalculate avg rating for the driver and update the drivers table
  if (booking.driverId) {
    const [agg] = await db
      .select({
        avgRating: sql<number>`coalesce(avg(rating::numeric), 0)::float`,
        totalCount: sql<number>`count(*)::int`,
      })
      .from(reviewsTable)
      .where(eq(reviewsTable.driverId, booking.driverId));

    await db
      .update(driversTable)
      .set({
        // `rating` is numeric(3,2) — drizzle represents that as a string to
        // preserve precision, so a raw JS number here is a type (and, on the
        // next precision-sensitive column, a real) bug.
        rating: agg ? String(Math.round(agg.avgRating * 10) / 10) : null,
      })
      .where(eq(driversTable.id, booking.driverId));
  }


  res.status(201).json({ ...review, createdAt: review.createdAt.toISOString() });
});

export default router;
