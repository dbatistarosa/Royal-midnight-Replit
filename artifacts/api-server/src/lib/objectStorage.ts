import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

// Replaces the previous Replit-sidecar-backed (http://127.0.0.1:1106)
// implementation, which only worked inside Replit's own hosting and was
// never functional once this app moved to Vercel. Uses Supabase Storage
// instead, server-side only, via the service role key (bypasses RLS by
// design — there is no separate per-object ACL layer here, matching the
// previous implementation's ACL check already being disabled/unused).
const PRIVATE_BUCKET = "object-storage";
const PUBLIC_BUCKET = "object-storage-public";

/** Image types the public serving route will hand back with their real
 *  Content-Type (see SAFE_PUBLIC_TYPES in routes/storage.ts). Anything else is
 *  served as an attachment, so it is pointless as a fleet photo. */
const PUBLIC_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for object storage uploads/downloads.",
    );
  }
  return createClient(url, key);
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

interface StoredObjectRef {
  bucket: string;
  path: string;
}

export class ObjectStorageService {
  /** Generates a signed upload URL for a new private object. Valid for 2 hours. */
  async getObjectEntityUploadURL(): Promise<string> {
    const supabase = getSupabaseAdmin();
    const path = `uploads/${randomUUID()}`;
    const { data, error } = await supabase.storage.from(PRIVATE_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      throw new Error(`Failed to create signed upload URL: ${error?.message ?? "unknown error"}`);
    }
    return data.signedUrl;
  }

  /**
   * Signed upload URL for an image that must be readable by anyone.
   *
   * getObjectEntityUploadURL() above targets the PRIVATE bucket, whose objects
   * are only reachable through a 10-minute signed URL that requires a session
   * to mint. That is right for a chauffeur's licence and wrong for a fleet
   * photo, which is rendered by a plain <img> on a public marketing page to
   * visitors who have never logged in. There was no way into the public bucket
   * at all — only `searchPublicObject` to read from it — which is why the
   * pricing screen could offer nothing better than a text box for a URL.
   *
   * Returns the path the browser should store, already in the form the public
   * serving route understands, so the caller never has to know the bucket
   * layout.
   */
  async getPublicUploadURL(fileName: string, contentType: string): Promise<{ uploadURL: string; objectPath: string }> {
    const supabase = getSupabaseAdmin();

    // Extension comes from the content type first — a browser-supplied filename
    // is attacker-controlled and may carry no extension, or a misleading one.
    const fromName = fileName.includes(".")
      ? fileName.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5)
      : "";
    const ext = PUBLIC_IMAGE_EXTENSIONS[contentType.split(";")[0]!.trim().toLowerCase()] ?? (fromName || "bin");

    const path = `fleet/${randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage.from(PUBLIC_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      throw new Error(`Failed to create public signed upload URL: ${error?.message ?? "unknown error"}`);
    }
    return { uploadURL: data.signedUrl, objectPath: `/api/storage/public-objects/${path}` };
  }

  /** Converts a Supabase signed-upload URL (or an already-internal /objects/ path) into our internal reference. */
  normalizeObjectEntityPath(rawPath: string): string {
    const marker = `/storage/v1/object/upload/sign/${PRIVATE_BUCKET}/`;
    if (!rawPath.includes(marker)) {
      return rawPath;
    }
    const url = new URL(rawPath);
    const idx = url.pathname.indexOf(marker);
    if (idx === -1) return rawPath;
    const entityId = url.pathname.slice(idx + marker.length);
    return `/objects/${entityId}`;
  }

  async getObjectEntityFile(objectPath: string): Promise<StoredObjectRef> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const path = objectPath.slice("/objects/".length);
    await this.assertExists(PRIVATE_BUCKET, path);
    return { bucket: PRIVATE_BUCKET, path };
  }

  async searchPublicObject(filePath: string): Promise<StoredObjectRef | null> {
    try {
      await this.assertExists(PUBLIC_BUCKET, filePath);
      return { bucket: PUBLIC_BUCKET, path: filePath };
    } catch {
      return null;
    }
  }

  async downloadObject(file: StoredObjectRef, cacheTtlSec = 3600): Promise<Response> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(file.bucket).download(file.path);
    if (error || !data) {
      throw new ObjectNotFoundError();
    }
    const isPublic = file.bucket === PUBLIC_BUCKET;
    return new Response(data, {
      headers: {
        "Content-Type": data.type || "application/octet-stream",
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
      },
    });
  }

  private async assertExists(bucket: string, path: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    const lastSlash = path.lastIndexOf("/");
    const dir = lastSlash === -1 ? "" : path.slice(0, lastSlash);
    const fileName = lastSlash === -1 ? path : path.slice(lastSlash + 1);

    const { data, error } = await supabase.storage.from(bucket).list(dir || undefined, { search: fileName });
    if (error || !data?.some((f) => f.name === fileName)) {
      throw new ObjectNotFoundError();
    }
  }
}
