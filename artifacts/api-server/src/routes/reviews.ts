import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, reviewsTable, bookingsTable, driversTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth.js";
import { withLock } from "../lib/durability.js";
import {
  ListReviewsQueryParams,
  CreateReviewBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/reviews", async (req, res): Promise<void> => {
  const parsed = ListReviewsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions = [];
  if (parsed.data.driverId != null) conditions.push(eq(reviewsTable.driverId, parsed.data.driverId));
  if (parsed.data.bookingId != null) conditions.push(eq(reviewsTable.bookingId, parsed.data.bookingId));
  const rawLimit = Number(req.query.limit ?? 50);
  const rawOffset = Number(req.query.offset ?? 0);
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
  const offset = Number.isInteger(rawOffset) ? Math.max(rawOffset, 0) : 0;

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
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(reviewsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(reviews.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/reviews", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const caller = req.currentUser!;
  const result = await withLock(
    `review:${caller.userId}:${parsed.data.bookingId}`,
    async (tx) => {
      // Verify ownership and completion inside the same transaction that
      // inserts the review. The client-supplied driverId/userId are never
      // trusted; the booking is the source of truth.
      const [booking] = await tx
        .select()
        .from(bookingsTable)
        .where(eq(bookingsTable.id, parsed.data.bookingId));
      if (!booking) return { status: 404 as const, body: { error: "Booking not found" } };
      if (caller.role !== "admin" && booking.userId !== caller.userId) {
        return { status: 403 as const, body: { error: "Forbidden" } };
      }
      if (booking.status !== "completed") {
        return {
          status: 400 as const,
          body: { error: "Reviews can only be submitted for completed rides" },
        };
      }
      if (booking.driverId == null) {
        return {
          status: 409 as const,
          body: { error: "This completed ride has no assigned driver to review" },
        };
      }

      const [existing] = await tx
        .select({ id: reviewsTable.id })
        .from(reviewsTable)
        .where(
          and(
            eq(reviewsTable.bookingId, booking.id),
            eq(reviewsTable.userId, caller.userId),
          ),
        )
        .limit(1);
      if (existing) {
        return { status: 409 as const, body: { error: "This booking has already been reviewed" } };
      }

      const [review] = await tx
        .insert(reviewsTable)
        .values({
          bookingId: booking.id,
          driverId: booking.driverId,
          userId: caller.userId,
          rating: parsed.data.rating,
          comment: parsed.data.comment ?? null,
        })
        .returning();
      if (!review) throw new Error("Review insert returned no row");

      const [agg] = await tx
        .select({
          avgRating: sql<number>`coalesce(avg(rating::numeric), 0)::float`,
        })
        .from(reviewsTable)
        .where(eq(reviewsTable.driverId, booking.driverId));

      await tx
        .update(driversTable)
        .set({
          rating: agg ? String(Math.round(agg.avgRating * 10) / 10) : null,
        })
        .where(eq(driversTable.id, booking.driverId));

      return {
        status: 201 as const,
        body: { ...review, createdAt: review.createdAt.toISOString() },
      };
    },
  );

  res.status(result.status).json(result.body);
});

export default router;
