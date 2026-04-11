import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, reviewsTable, bookingsTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth.js";
import {
  ListReviewsQueryParams,
  ListReviewsResponse,
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

  const reviews = await db
    .select()
    .from(reviewsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json(
    ListReviewsResponse.parse(
      reviews.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
    )
  );
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
  res.status(201).json({ ...review, createdAt: review.createdAt.toISOString() });
});

export default router;
