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

// Prerendered marketing pages ship real markup inside #root; hydrate it instead
// of wiping and re-rendering. Portal/auth routes still get the empty SPA shell.
if (rootEl.hasChildNodes()) {
  hydrateRoot(rootEl, <App />);
} else {
  createRoot(rootEl).render(<App />);
}
