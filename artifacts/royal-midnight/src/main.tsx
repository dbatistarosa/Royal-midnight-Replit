import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { initSentry } from "./lib/sentry";

initSentry();

setAuthTokenGetter(() => {
  try {
    const raw = localStorage.getItem("rm_auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string };
    return parsed.token ?? null;
  } catch {
    return null;
  }
});

const rootEl = document.getElementById("root")!;

// Prerendered marketing pages ship real markup inside #root; hydrate it instead
// of wiping and re-rendering. Portal/auth routes still get the empty SPA shell.
if (rootEl.hasChildNodes()) {
  hydrateRoot(rootEl, <App />);
} else {
  createRoot(rootEl).render(<App />);
}
