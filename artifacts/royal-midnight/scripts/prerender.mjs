import { build } from "vite";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "dist/public");
const serverOutDir = join(root, "dist/server");

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
  // A prospective chauffeur reads this before signing up, and an existing one
  // may need to produce it later — it belongs with the other legal pages
  // rather than behind a client-side render.
  "/driver-agreement",
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

  // Vite's React plugin selects its production JSX runtime from NODE_ENV.
  // This process is the production prerender phase, so make that mode
  // explicit before building the SSR entry.
  process.env.NODE_ENV = "production";
  // Build the SSR entry as a real production bundle. Loading the source entry
  // through Vite's development ModuleRunner can create a second React copy in
  // a pnpm workspace; a production SSR bundle uses one Node module graph.
  await build({
    configFile: join(root, "vite.config.ts"),
    root,
    mode: "production",
    build: {
      ssr: "src/entry-server.tsx",
      outDir: serverOutDir,
      emptyOutDir: true,
      rollupOptions: {
        output: { entryFileNames: "entry-server.js" },
      },
    },
  });

  const { render } = await import(
    `${pathToFileURL(join(serverOutDir, "entry-server.js")).href}?v=${Date.now()}`,
  );

  for (const route of ROUTES) {
    const { html } = await render(route);
    const page = splice(template, route, html);

    const outPath = route === "/" ? join(outDir, "index.html") : join(outDir, route.slice(1), "index.html");
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, page, "utf-8");
    console.log(`prerendered ${route} -> ${outPath.replace(root, "")}`);
  }
}

main().catch((err) => {
  console.error("prerender failed:", err);
  process.exit(1);
});
