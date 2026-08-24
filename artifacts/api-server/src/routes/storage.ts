import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { db, objectOwnersTable, driversTable, complianceDocumentsTable } from "@workspace/db";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { hasPgErrorCode, UNDEFINED_TABLE } from "../lib/pgError.js";
import { requireAuth, requireAdmin, type AuthUser } from "../middleware/auth.js";
import { signObjectPath, verifyObjectSignature } from "../lib/signedUrl.js";
import { registrationUploadLimiter } from "../lib/rateLimit.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/** Rebuild the `/objects/<path>` key from the wildcard route param. */
function objectPathFromRequest(req: Request): string {
  const raw = req.params["path"];
  const wildcardPath = Array.isArray(raw) ? raw.join("/") : String(raw ?? "");
  return `/objects/${wildcardPath}`;
}

/** Reduce a bare key or a `/objects/...` path to the canonical internal form,
 *  or null when it tries to climb out of the private object directory. */
function normalizeObjectKey(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const key = raw.replace(/^\/?objects\//, "").replace(/^\/+/, "");
  if (!key || key.includes("..")) return null;
  return key;
}

/**
 * Ownership check for private objects.
 *
 * A valid session is not authorisation. The private bucket holds driver
 * licences, insurance certificates and vehicle registrations; before this
 * check, any account — including a passenger who signed up a minute ago —
 * could hand /storage/sign an arbitrary object path and download them.
 * Paths are `uploads/<randomUUID()>`, but a UUID that leaks once (an email, a
 * screenshot, a compliance screen) otherwise granted permanent access.
 *
 * An object with no owner row is readable by admin only. That is deliberate:
 * unknown provenance fails closed.
 */
async function canReadObject(caller: AuthUser, objectPath: string): Promise<boolean> {
  if (caller.role === "admin") return true;

  let row: { ownerUserId: number } | undefined;
  try {
    [row] = await db
      .select({ ownerUserId: objectOwnersTable.ownerUserId })
      .from(objectOwnersTable)
      .where(eq(objectOwnersTable.objectPath, objectPath));
  } catch (err) {
    // Deploy and migration are separate steps here, so the code can be live
    // before migration 0006 has been run. Falling back to deriving ownership
    // is still fail-closed; failing open was never an option for an ACL.
    if (!hasPgErrorCode(err, UNDEFINED_TABLE)) throw err;
    console.error("[storage] object_owners table is missing — run migration 0006_object_ownership.sql");
  }

  if (row) return row.ownerUserId === caller.userId;

  // No registry row. Derive ownership from the tables that reference the
  // object instead of denying outright, which also covers anything uploaded
  // before the registry existed.
  return ownsObjectByReference(caller.userId, objectPath);
}

/** Canonical `/objects/<key>` form, or null for anything that is not one of
 *  our storage keys (an absolute URL, or a traversal attempt). Exported for
 *  auth.ts, which needs the same check when claiming ownership of documents
 *  uploaded before the account that owns them existed (see
 *  POST /storage/registration-uploads/request-url below). */
export function canonicalObjectPath(raw: string | null | undefined): string | null {
  if (!raw || /^https?:/i.test(raw)) return null;
  const key = raw.replace(/^\/?objects\//, "").replace(/^\/+/, "");
  if (!key || key.includes("..")) return null;
  return `/objects/${key}`;
}

/** Is this object referenced by the caller's own driver record or one of their
 *  own compliance submissions? Used when the registry has no row for it. */
async function ownsObjectByReference(userId: number, objectPath: string): Promise<boolean> {
  const [driver] = await db
    .select({
      id: driversTable.id,
      licenseDoc: driversTable.licenseDoc,
      regDoc: driversTable.regDoc,
      insuranceDoc: driversTable.insuranceDoc,
      profilePicture: driversTable.profilePicture,
    })
    .from(driversTable)
    .where(eq(driversTable.userId, userId));
  if (!driver) return false;

  const owned = [driver.licenseDoc, driver.regDoc, driver.insuranceDoc, driver.profilePicture]
    .map(canonicalObjectPath)
    .filter((p): p is string => p !== null);
  if (owned.includes(objectPath)) return true;

  const docs = await db
    .select({ fileUrl: complianceDocumentsTable.fileUrl })
    .from(complianceDocumentsTable)
    .where(eq(complianceDocumentsTable.driverId, driver.id));
  return docs.some(d => canonicalObjectPath(d.fileUrl) === objectPath);
}

/** Allow the request through on a valid session OR a valid short-lived
 *  signature. The signature path exists so <img src> and <a href> in the admin
 *  document-review UI keep working — browsers never send an Authorization
 *  header for those (CN-003). A signature is only ever issued by
 *  POST /storage/sign, which checks ownership first, and is bound to that one
 *  path — so the signature branch needs no further check. */
function requireAuthOrSignature(req: Request, res: Response, next: NextFunction): void {
  if (verifyObjectSignature(objectPathFromRequest(req), req.query["exp"], req.query["sig"])) {
    res.locals["signatureVerified"] = true;
    next();
    return;
  }
  requireAuth(req, res, next);
}

/** Headers that must never be copied verbatim from stored blobs.
 *
 *  downloadObject() echoes the object's own Content-Type. An attacker who got
 *  an HTML file into the bucket could otherwise have it served as text/html
 *  from this application's own origin — stored XSS against a same-origin admin
 *  session. Private objects are only ever documents and images for review, so
 *  they are served as opaque downloads instead (CN-003). */
function setSafeDownloadHeaders(res: Response, sourceHeaders: Headers): void {
  sourceHeaders.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === "content-type" || k === "content-disposition" || k === "content-security-policy") return;
    res.setHeader(key, value);
  });
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", "attachment");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

/** Public assets are meant to render inline, so their Content-Type is kept —
 *  but only from a whitelist. Echoing the stored blob's own type would let
 *  anything that ever writes an .html or .svg into the public bucket have it
 *  served as active content from this origin, which is stored XSS against an
 *  admin session. The fleet-image picker is now a writer (admin-only, images
 *  only), which is exactly why this whitelist has to stay. */
const SAFE_PUBLIC_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "application/pdf",
]);

/** What may be UPLOADED to the public bucket. A subset of SAFE_PUBLIC_TYPES:
 *  PDFs are safe to serve but are not fleet photography, and the only writer of
 *  this bucket is the vehicle-image picker. */
const PUBLIC_UPLOAD_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif",
]);

/** 8 MB. Generous for a hero image, small enough that a phone photo dropped in
 *  by mistake is rejected with an explanation rather than uploaded. */
const MAX_PUBLIC_UPLOAD_BYTES = 8 * 1024 * 1024;

function setSafePublicHeaders(res: Response, sourceHeaders: Headers): void {
  sourceHeaders.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === "content-type" || k === "content-disposition") return;
    res.setHeader(key, value);
  });
  const contentType = (sourceHeaders.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const isSafe = SAFE_PUBLIC_TYPES.has(contentType);
  res.setHeader("Content-Type", isSafe ? contentType : "application/octet-stream");
  if (!isSafe) res.setHeader("Content-Disposition", "attachment");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    // Claim the path for this user before handing back the URL. Without this
    // row the object is admin-only forever, so it has to be awaited — a
    // fire-and-forget insert would leave the uploader locked out of their own
    // document whenever the write lost the race with the upload.
    try {
      await db
        .insert(objectOwnersTable)
        .values({ objectPath, ownerUserId: req.currentUser!.userId })
        .onConflictDoNothing({ target: objectOwnersTable.objectPath });
    } catch (err) {
      // Tolerate the window where this code is deployed and migration 0006 is
      // not applied yet. Reads fall back to deriving ownership from the row
      // that will reference this path, so the upload still works end to end.
      if (!hasPgErrorCode(err, UNDEFINED_TABLE)) throw err;
      req.log.error("object_owners table is missing — run migration 0006_object_ownership.sql");
    }

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/** Compliance documents (license, insurance, registration, profile photo).
 *  Phone photos of a physical document tend to run larger than a picked
 *  product image, hence the higher cap than MAX_PUBLIC_UPLOAD_BYTES. */
const REGISTRATION_UPLOAD_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "application/pdf",
]);
const MAX_REGISTRATION_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * POST /storage/registration/uploads/request-url
 *
 * Same shape as POST /storage/uploads/request-url, but reachable without a
 * session. The driver-onboarding form collects a license, insurance
 * certificate and registration document on its last step and submits
 * everything (including these paths) atomically via POST /auth/driver-register
 * — at the point of uploading, the account those documents belong to does not
 * exist yet, so requireAuth cannot apply here the way it does everywhere else
 * in this file.
 *
 * No object_owners row is written: there is no user to own it yet. The object
 * sits unclaimed — readable by nobody but admin (canReadObject's fail-closed
 * default) — until registration succeeds, at which point driver-register
 * claims it for the new account. An abandoned upload (form never submitted)
 * just stays unclaimed forever, same as any other orphaned object.
 *
 * What stands in for requireAuth here: registrationUploadLimiter (this is the
 * one storage route reachable pre-auth, so it needs its own throttle) and a
 * content-type/size allowlist matching the public upload route below, so an
 * anonymous caller can't use this to stash arbitrary files in the private
 * bucket.
 */
router.post("/storage/registration/uploads/request-url", registrationUploadLimiter(), async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { name, size, contentType } = parsed.data;
  const type = contentType.split(";")[0]!.trim().toLowerCase();

  if (!REGISTRATION_UPLOAD_TYPES.has(type)) {
    res.status(400).json({ error: "Only JPG, PNG, WebP, GIF, or PDF files can be uploaded here." });
    return;
  }
  if (size > MAX_REGISTRATION_UPLOAD_BYTES) {
    res.status(400).json({
      error: `That file is ${(size / 1_048_576).toFixed(1)} MB. The limit is ${MAX_REGISTRATION_UPLOAD_BYTES / 1_048_576} MB.`,
    });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating registration upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * POST /storage/public/uploads/request-url
 *
 * Same two-step shape as the private upload above — ask for a URL, then PUT the
 * file to it — but the object lands in the public bucket and the path handed
 * back is served by anyone without a session.
 *
 * Admin-only, and that is the whole security boundary: this writes somewhere
 * world-readable, so it must not be reachable by every signed-in passenger, or
 * the site becomes a free file host. Restricted to real image types for the
 * same reason — the public serving route already refuses to hand anything else
 * back with its own Content-Type, so a non-image here would be dead weight at
 * best and a hosted payload at worst.
 *
 * The path is deliberately NOT registered in object_owners: these are public
 * marketing assets with no owner, and the ACL only governs the private bucket.
 */
router.post("/storage/public/uploads/request-url", requireAdmin, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { name, size, contentType } = parsed.data;
  const type = contentType.split(";")[0]!.trim().toLowerCase();

  if (!PUBLIC_UPLOAD_TYPES.has(type)) {
    res.status(400).json({ error: "Only PNG, JPEG, WebP, AVIF or GIF images can be uploaded here." });
    return;
  }
  if (size > MAX_PUBLIC_UPLOAD_BYTES) {
    res.status(400).json({
      error: `That image is ${(size / 1_048_576).toFixed(1)} MB. The limit is ${MAX_PUBLIC_UPLOAD_BYTES / 1_048_576} MB — resize it and try again.`,
    });
    return;
  }

  try {
    const { uploadURL, objectPath } = await objectStorageService.getPublicUploadURL(name, type);
    res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  } catch (error) {
    req.log.error({ err: error }, "Error generating public upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * POST /storage/sign
 *
 * Exchange an object path for a short-lived signed download URL. Requires a
 * session; the resulting URL then works in a plain <img>/<a> for 10 minutes.
 */
router.post("/storage/sign", requireAuth, async (req: Request, res: Response) => {
  // Accept either a bare key or a full `/objects/...` path, and refuse anything
  // that tries to climb out of the private object directory.
  const key = normalizeObjectKey((req.body as { objectPath?: unknown } | undefined)?.objectPath);
  if (!key) {
    res.status(400).json({ error: "Invalid objectPath" });
    return;
  }

  const caller = req.currentUser!;
  if (!(await canReadObject(caller, `/objects/${key}`))) {
    req.log.warn(
      { ip: req.ip, path: req.path, userId: caller.userId, role: caller.role, objectKey: key },
      "authorization_failed",
    );
    // 404 rather than 403 — a 403 would confirm the object exists to someone
    // guessing paths.
    res.status(404).json({ error: "Object not found" });
    return;
  }

  try {
    const { exp, sig } = signObjectPath(`/objects/${key}`);
    res.json({
      // Relative to the API base, so the client composes it with its own
      // API_BASE and this keeps working if the base path ever changes.
      path: `/storage/objects/${key}?exp=${exp}&sig=${sig}`,
      expiresAt: exp,
    });
  } catch (error) {
    req.log.error({ err: error }, "Error signing object URL");
    res.status(500).json({ error: "Failed to sign object URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    setSafePublicHeaders(res, response.headers);

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", requireAuthOrSignature, async (req: Request, res: Response) => {
  try {
    const objectPath = objectPathFromRequest(req);

    // The signature branch is already bound to this exact path, and a signature
    // is only issued after the ownership check in POST /storage/sign. The
    // session branch has had no ownership check until here.
    if (!res.locals["signatureVerified"]) {
      const caller = req.currentUser!;
      if (!(await canReadObject(caller, objectPath))) {
        req.log.warn(
          { ip: req.ip, path: req.path, userId: caller.userId, role: caller.role },
          "authorization_failed",
        );
        res.status(404).json({ error: "Object not found" });
        return;
      }
    }

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    setSafeDownloadHeaders(res, response.headers);

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
