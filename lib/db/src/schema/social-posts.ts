import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const socialPostsTable = pgTable("social_posts", {
  id: serial("id").primaryKey(),
  /** "post" (feed image), "reel" (feed video), or "story". */
  postType: text("post_type").notNull(),
  /** Only meaningful for "story", which can be either — "post" is always an
   *  image and "reel" is always a video via the Graph API's REELS media type. */
  mediaKind: text("media_kind").notNull().default("image"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  caption: text("caption").notNull().default(""),
  hashtags: text("hashtags"),
  /** Public HTTPS URL the Instagram Graph API will fetch the asset from —
   *  the container can't be created until this is set, so a row can be
   *  scheduled with the calendar's copy well before the media exists. */
  mediaUrl: text("media_url"),
  /** "draft" | "scheduled" | "publishing" | "published" | "failed" */
  status: text("status").notNull().default("draft"),
  igMediaId: text("ig_media_id"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSocialPostSchema = createInsertSchema(socialPostsTable).omit({
  id: true,
  createdAt: true,
  status: true,
  igMediaId: true,
  publishedAt: true,
  lastError: true,
});
export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;
export type SocialPost = typeof socialPostsTable.$inferSelect;
