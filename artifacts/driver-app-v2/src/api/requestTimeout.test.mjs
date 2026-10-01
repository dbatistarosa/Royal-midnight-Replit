import test from "node:test";
import assert from "node:assert/strict";
import { fetchWithTimeout } from "./requestTimeout.ts";

test("fetchWithTimeout aborts a request that exceeds the deadline", async () => {
  const delayedFetch = (_input, init) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(new Response("ok")), 40);
    init.signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });

  await assert.rejects(
    fetchWithTimeout("https://example.test", {}, 5, delayedFetch),
    (error) => error instanceof Error && error.name === "TimeoutError" && /timed out/i.test(error.message),
  );
});

test("fetchWithTimeout preserves a caller cancellation", async () => {
  const controller = new AbortController();
  const delayedFetch = (_input, init) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });
  const request = fetchWithTimeout("https://example.test", { signal: controller.signal }, 100, delayedFetch);
  controller.abort();
  await assert.rejects(request, (error) => error instanceof Error && error.name === "AbortError");
});
