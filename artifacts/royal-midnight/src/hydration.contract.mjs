import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const srcRoot = new URL("./", import.meta.url);
const appRoot = new URL("../", import.meta.url);

test("only matching prerendered routes hydrate and structured data stays in the hydrated tree", async () => {
  const [main, prerender, faq, pageSeo] = await Promise.all([
    readFile(new URL("main.tsx", srcRoot), "utf8"),
    readFile(new URL("scripts/prerender.mjs", appRoot), "utf8"),
    readFile(new URL("pages/faq.tsx", srcRoot), "utf8"),
    readFile(new URL("components/PageSeo.tsx", srcRoot), "utf8"),
  ]);

  assert.match(prerender, /data-prerendered-path/);
  assert.match(main, /dataset\.prerenderedPath/);
  assert.doesNotMatch(main, /rootEl\.hasChildNodes\(\)/);
  assert.match(faq, /<details/);
  assert.match(faq, /<summary/);
  assert.doesNotMatch(faq, /AccordionPrimitive|<Accordion/);
  assert.doesNotMatch(prerender, /application\\\/ld\\\+json/);
  assert.match(pageSeo, /<Helmet>[\s\S]*?<\/Helmet>[\s\S]*?schemaList\.map/);
});
