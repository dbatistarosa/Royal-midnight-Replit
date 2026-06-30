import { createServer } from "vite";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "dist/public");

// Public marketing routes only — mirrors public/sitemap.xml. Portal/auth routes
// (/admin, /driver, /passenger, /corporate, /auth, /book/:id, /track/:id) are
// intentionally excluded; they stay served by the SPA fallback as before.
const ROUTES = [
  "/",
  "/about",
  "/services",
  "/services/airport-transfers",
  "/services/hourly-chauffeur",
  "/services/corporate",
  "/services/events",
  "/fleet",
  "/pricing",
  "/contact",
  "/faq",
  "/book",
  "/privacy",
  "/terms",
];

// React 19 renders react-helmet-async's <title>/<meta>/<link>/<script> tags
// inline (no head-context capture in SSR — see entry-server.tsx). Pull them
// back out of the rendered body string and hoist them into <head> ourselves.
const HEAD_TAG_PATTERN = /<title>[\s\S]*?<\/title>|<meta\b[^>]*\/>|<link\b[^>]*\/>|<script type="application\/ld\+json">[\s\S]*?<\/script>/g;

function extractHeadTags(html) {
  const headTags = html.match(HEAD_TAG_PATTERN) ?? [];
  const body = html.replace(HEAD_TAG_PATTERN, "");
  return { headTags, body };
}

// The static template's own <title> and <meta name="description"> (set for the
// homepage, before the <!-- Open Graph --> marker) must be stripped too, or the
// per-page ones extracted below end up duplicating rather than replacing them.
const STATIC_TITLE_PATTERN = /<title>[\s\S]*?<\/title>/;
const STATIC_DESCRIPTION_PATTERN = /<meta\s+name="description"[^>]*>/;

function splice(template, path, html) {
  const ogMarker = "<!-- Open Graph -->";
  const tailMarker = "<!-- Favicon -->";
  const ogIdx = template.indexOf(ogMarker);
  const tailIdx = template.indexOf(tailMarker);
  if (ogIdx === -1 || tailIdx === -1) {
    throw new Error(`prerender: could not find head markers while rendering ${path}`);
  }

  const { headTags, body } = extractHeadTags(html);
  if (!headTags.some((t) => t.startsWith("<title>"))) {
    throw new Error(`prerender: no <title> found in rendered output for ${path} — PageSeo likely missing`);
  }

  const prefix = template
    .slice(0, ogIdx)
    .replace(STATIC_TITLE_PATTERN, "")
    .replace(STATIC_DESCRIPTION_PATTERN, "");
  const tail = template.slice(tailIdx);
  const withHead = prefix + headTags.join("") + "\n    " + tail;
  return withHead.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}

async function main() {
  const template = await readFile(join(outDir, "index.html"), "utf-8");

  const vite = await createServer({
    root,
    server: { middlewareMode: "ssr" },
    appType: "custom",
  });

  try {
    const { render } = await vite.ssrLoadModule("/src/entry-server.tsx");

    for (const route of ROUTES) {
      const { html } = await render(route);
      const page = splice(template, route, html);

      const outPath = route === "/" ? join(outDir, "index.html") : join(outDir, route.slice(1), "index.html");
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, page, "utf-8");
      console.log(`prerendered ${route} -> ${outPath.replace(root, "")}`);
    }
  } finally {
    await vite.close();
  }
}

main().catch((err) => {
  console.error("prerender failed:", err);
  process.exit(1);
});
