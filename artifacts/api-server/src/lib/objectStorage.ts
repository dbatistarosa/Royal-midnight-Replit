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
