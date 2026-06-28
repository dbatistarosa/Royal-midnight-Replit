import { renderToString } from "react-dom/server";
import App from "./App";

// react-helmet-async only renders <title>/<meta>/<link> inline on React 19 (no
// context capture — see its README's "React 19 SSR note"); scripts/prerender.mjs
// pulls those tags back out of `html` via regex and hoists them into <head> itself.
export function render(path: string): { html: string } {
  const html = renderToString(<App ssrPath={path} />);
  return { html };
}
