import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      // @workspace/db throws at import time if DATABASE_URL is unset (it only
      // validates the connection string eagerly, pg's Pool connects lazily on
      // first query) — this dummy value lets pure-logic modules that
      // transitively import the db package load under test without a real
      // Postgres instance. Points at an unused port so it fails fast rather
      // than colliding with a real local Postgres on the default 5432.
      DATABASE_URL: "postgres://test:test@127.0.0.1:54329/test_db",
    },
  },
});
