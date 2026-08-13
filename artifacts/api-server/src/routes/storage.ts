import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { requireAuth } from "../middleware/auth.js";
import { signObjectPath, verifyObjectSignature } from "../lib/signedUrl.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/** Rebuild the `/objects/<path>` key from the wildcard route param. */
function objectPathFromRequest(req: Request): string {
  const raw = req.params["path"];
  const wildcardPath = Array.isArray(raw) ? raw.join("/") : String(raw ?? "");
  return `/objects/${wildcardPath}`;
}

/** Allow the request through on a valid session OR a valid short-lived
 *  signature. The signature path exists so <img src> and <a href> in the admin
 *  document-review UI keep working — browsers never send an Authorization
 *  header for those (CN-003). */
function requireAuthOrSignature(req: Request, res: Response, next: NextFunction): void {
  if (verifyObjectSignature(objectPathFromRequest(req), req.query["exp"], req.query["sig"])) {
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

/**
 * POST /storage/sign
 *
 * Exchange an object path for a short-lived signed download URL. Requires a
 * session; the resulting URL then works in a plain <img>/<a> for 10 minutes.
 */
router.post("/storage/sign", requireAuth, (req: Request, res: Response) => {
  const raw = (req.body as { objectPath?: unknown } | undefined)?.objectPath;
  if (typeof raw !== "string" || !raw.trim()) {
    res.status(400).json({ error: "objectPath is required" });
    return;
  }

  // Accept either a bare key or a full `/objects/...` path, and refuse anything
  // that tries to climb out of the private object directory.
  const key = raw.replace(/^\/?objects\//, "").replace(/^\/+/, "");
  if (!key || key.includes("..")) {
    res.status(400).json({ error: "Invalid objectPath" });
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
    response.headers.forEach((value, key) => res.setHeader(key, value));

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
