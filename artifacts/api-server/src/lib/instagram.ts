/**
 * Instagram Graph API (Content Publishing API) client.
 * Requires IG_BUSINESS_ACCOUNT_ID + IG_ACCESS_TOKEN env vars — see .env.example
 * for how to obtain them (Instagram Professional account -> Facebook Page ->
 * Meta developer app -> long-lived Page access token).
 * Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing
 */

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const IG_BUSINESS_ACCOUNT_ID = process.env.IG_BUSINESS_ACCOUNT_ID;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;

export function isInstagramConfigured(): boolean {
  return !!(IG_BUSINESS_ACCOUNT_ID && IG_ACCESS_TOKEN);
}

export type InstagramMediaType = "IMAGE" | "REELS" | "STORIES_IMAGE" | "STORIES_VIDEO";

export interface PublishToInstagramParams {
  mediaType: InstagramMediaType;
  /** Public HTTPS URL — the Graph API fetches the asset itself, it does not accept file uploads. */
  mediaUrl: string;
  /** Ignored for STORIES_* — Instagram Stories don't support caption text via the API. */
  caption?: string;
}

type GraphErrorBody = { error?: { message?: string; type?: string; code?: number; fbtrace_id?: string } };

async function graphFetch(path: string, params: Record<string, string>, method: "GET" | "POST"): Promise<any> {
  if (!IG_ACCESS_TOKEN) throw new Error("IG_ACCESS_TOKEN is not configured");

  const url = new URL(`${GRAPH_BASE}${path}`);
  const body = new URLSearchParams({ ...params, access_token: IG_ACCESS_TOKEN });

  const res = await fetch(
    method === "GET" ? `${url.toString()}?${body.toString()}` : url.toString(),
    {
      method,
      ...(method === "POST" ? { body } : {}),
      signal: AbortSignal.timeout(8_000),
    },
  );

  const json = (await res.json().catch(() => ({}))) as GraphErrorBody & Record<string, any>;
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? `Graph API returned HTTP ${res.status}`;
    throw new Error(`[instagram] ${msg} (code=${json.error?.code ?? res.status}, fbtrace_id=${json.error?.fbtrace_id ?? "n/a"})`);
  }
  return json;
}

export async function createMediaContainer({ mediaType, mediaUrl, caption }: PublishToInstagramParams): Promise<string> {
  const params: Record<string, string> = {};

  switch (mediaType) {
    case "IMAGE":
      params.image_url = mediaUrl;
      if (caption) params.caption = caption;
      break;
    case "REELS":
      params.media_type = "REELS";
      params.video_url = mediaUrl;
      if (caption) params.caption = caption;
      break;
    case "STORIES_IMAGE":
      params.media_type = "STORIES";
      params.image_url = mediaUrl;
      break;
    case "STORIES_VIDEO":
      params.media_type = "STORIES";
      params.video_url = mediaUrl;
      break;
  }

  const json = await graphFetch(`/${IG_BUSINESS_ACCOUNT_ID}/media`, params, "POST");
  const containerId = json.id as string | undefined;
  if (!containerId) throw new Error("[instagram] media container creation returned no id");
  return containerId;
}

export async function getContainerStatus(containerId:string):Promise<string>{
 const result=await graphFetch('/'+containerId,{fields:'status_code'},'GET');return result.status_code;
}

export async function publishContainer(containerId: string): Promise<string> {
  const json = await graphFetch(`/${IG_BUSINESS_ACCOUNT_ID}/media_publish`, { creation_id: containerId }, "POST");
  const mediaId = json.id as string | undefined;
  if (!mediaId) throw new Error("[instagram] media_publish returned no id");
  return mediaId;
}

