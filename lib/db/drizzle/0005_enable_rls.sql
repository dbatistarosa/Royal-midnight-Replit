-- CN-007 — Row Level Security as schema-as-code.
--
-- The only ENABLE ROW LEVEL SECURITY in the codebase lived inside
-- runStartupMigrations() in api-server/src/index.ts. Vercel boots from
-- dist/app.mjs, not dist/index.mjs, so that path never runs in production — it
-- only ever ran on Railway. Any table added from now on would silently ship
-- without RLS.
--
-- Deliberately NO policies.
--
-- Checking production before writing this showed RLS already enabled on all 28
-- tables with zero policies. That is not a gap — it is the correct posture for
-- this app. RLS with no policy denies every non-owner role, and the API is the
-- only thing that talks to this database; it connects as the table owner, which
-- bypasses RLS. Adding a permissive "app can do everything" policy, as an
-- earlier draft of this migration did, would have loosened that for no gain.
--
-- The REVOKE is the part that adds something. anon and authenticated hold table
-- grants from Supabase's defaults, and they are unused here — nothing outside
-- api-server touches Postgres, and the one supabase-js client in the codebase
-- (lib/objectStorage.ts) is server-side. Dropping the grants means that if a
-- permissive policy is ever added by accident — the dashboard's "enable read
-- access for all users" button is one click — PostgREST still cannot read the
-- table. RLS alone would not save you there.
--
-- Iterates over the live table list rather than a hardcoded array so tables
-- added later are covered without editing this file.

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    -- Stale policy from an earlier attempt embedded an environment-specific
    -- role name and broke cross-environment deploys.
    EXECUTE format('DROP POLICY IF EXISTS app_full_access ON public.%I', tbl);

    -- Idempotent: already enabled on every existing table.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', tbl);
  END LOOP;
END $$;

-- Stop Supabase handing those grants to future tables automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
