import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { initSentry } from "./lib/sentry";

initSentry();

// No bootstrap token getter on the web build: the session lives in an HttpOnly
// cookie that is sent automatically with same-origin API requests, and is
// deliberately unreadable from JavaScript (CN-014). AuthProvider still
// registers an in-memory getter for the current tab after a fresh login.

const rootEl = document.getElementById("root")!;

// Vercel serves the prerendered homepage as the SPA fallback for portal/auth
// routes. Hydrate only when the marker belongs to the URL being visited;
// otherwise the homepage markup and the portal tree cannot possibly match.
const normalizePath = (path: string) => path === "/" ? path : path.replace(/\/+$/, "");
const prerenderedPath = rootEl.dataset.prerenderedPath;
const shouldHydrate = prerenderedPath !== undefined
  && normalizePath(prerenderedPath) === normalizePath(window.location.pathname);

if (shouldHydrate) {
  hydrateRoot(rootEl, <App />);
} else {
  rootEl.replaceChildren();
  createRoot(rootEl).render(<App />);
}
