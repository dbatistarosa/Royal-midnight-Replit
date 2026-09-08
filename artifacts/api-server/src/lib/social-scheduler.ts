import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { rows } from "./durability.js";
import {
  isInstagramConfigured,
  createMediaContainer,
  getContainerStatus,
  publishContainer,
  type InstagramMediaType,
} from "./instagram.js";
type Post = {
  id: number;
  post_type: string;
  media_kind: string;
  media_url: string;
  caption: string;
  hashtags: string | null;
  container_id: string | null;
};
export async function publishDueSocialPosts(): Promise<void> {
  const [post] = rows<Post>(
    await db.execute(sql`
  UPDATE social_posts SET status='publishing',lease_until=now()+interval '2 minutes',attempts=attempts+1
  WHERE id=(SELECT id FROM social_posts WHERE media_url IS NOT NULL AND scheduled_at<=now() AND next_attempt_at<=now() AND attempts<8
   AND (status IN ('scheduled','failed') OR (status='publishing' AND (lease_until IS NULL OR lease_until<now())))
   ORDER BY scheduled_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`),
  );
  if (!post) return;
  try {
    if (!isInstagramConfigured())
      throw new Error("Instagram credentials are not configured");
    if (!post.container_id) {
      const mediaType: InstagramMediaType =
        post.post_type === "reel"
          ? "REELS"
          : post.post_type === "story"
            ? post.media_kind === "video"
              ? "STORIES_VIDEO"
              : "STORIES_IMAGE"
            : "IMAGE";
      const caption = mediaType.startsWith("STORIES")
        ? undefined
        : [post.caption, post.hashtags].filter(Boolean).join("\n\n");
      const id = await createMediaContainer({
        mediaType,
        mediaUrl: post.media_url,
        caption,
      });
      await db.execute(
        sql`UPDATE social_posts SET container_id=${id},lease_until=NULL,status='scheduled',next_attempt_at=now()+interval '1 minute' WHERE id=${post.id}`,
      );
      return;
    }
    const status = await getContainerStatus(post.container_id);
    if (status === "PUBLISHED") {
      // A response may have been lost after publication. Never publish that container twice.
      await db.execute(
        sql`UPDATE social_posts SET status='published',published_at=coalesce(published_at,now()),lease_until=NULL,last_error='Published at Instagram; media ID needs reconciliation' WHERE id=${post.id}`,
      );
      return;
    }
    if (status === "ERROR" || status === "EXPIRED")
      throw new Error(
        "Instagram container " +
          status +
          "; replace the media before rescheduling",
      );
    if (status !== "FINISHED") {
      await db.execute(
        sql`UPDATE social_posts SET status='scheduled',lease_until=NULL,next_attempt_at=now()+interval '1 minute' WHERE id=${post.id}`,
      );
      return;
    }
    const mediaId = await publishContainer(post.container_id);
    await db.execute(
      sql`UPDATE social_posts SET status='published',ig_media_id=${mediaId},published_at=now(),lease_until=NULL,last_error=NULL WHERE id=${post.id}`,
    );
  } catch (err) {
    await db.execute(
      sql`UPDATE social_posts SET status='failed',lease_until=NULL,last_error=${String((err as Error).message).slice(0, 500)},next_attempt_at=now()+interval '5 minutes' WHERE id=${post.id}`,
    );
    throw err;
  }
}
