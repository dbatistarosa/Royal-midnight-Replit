-- CN-007 — Row Level Security as schema-as-code.
--
-- RLS was only ever enabled by runStartupMigrations() in api-server/src/index.ts.
-- Vercel boots from dist/app.mjs, not dist/index.mjs, so that function never runs
-- in production — it only ever ran on Railway. Production is Vercel + Supabase,
-- and Supabase exposes PostgREST on the anon/authenticated roles at all times,
-- so those tables were reachable with no database-layer control at all.
--
-- Two things happen here:
--   1. RLS is turned on for every table.
--   2. Access is granted explicitly rather than relying on "the app user owns
--      the table so it bypasses RLS". That assumption holds only while the app
--      connects as the owner; Supabase's pooler and any future read-replica or
--      analytics role would not, and the app would break in a way that looks
--      like data loss. FORCE is deliberately NOT used, so the owner keeps its
--      bypass and the API server is unaffected.
--
-- Effect on PostgREST: with RLS on and no policy granting anon/authenticated,
-- those roles see zero rows. That is the intent — this app talks to Postgres
-- through the Express API, never through PostgREST from the browser.

DO $$
DECLARE
  tbl    TEXT;
  tables TEXT[] := ARRAY[
    'users', 'drivers', 'bookings', 'vehicles', 'saved_addresses',
    'reviews', 'support_tickets', 'ticket_messages', 'notifications',
    'promo_codes', 'pricing_rules', 'settings', 'sessions',
    'password_reset_tokens', 'email_logs', 'vehicle_catalog', 'otp_codes',
    'user_favorite_drivers', 'geo_zones', 'managed_travelers',
    'compliance_documents', 'extra_services', 'booking_extras',
    'driver_vehicles', 'fixed_routes'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Skip tables that do not exist in this environment rather than aborting
    -- the whole migration.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      RAISE NOTICE 'skipping missing table %', tbl;
      CONTINUE;
    END IF;

    -- Stale policy from an earlier attempt embedded an environment-specific
    -- role name and broke cross-environment deploys.
    EXECUTE format('DROP POLICY IF EXISTS app_full_access ON public.%I', tbl);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- Explicit grant for the role the API actually connects as, so the app
    -- keeps working even if it stops being the table owner.
    EXECUTE format('DROP POLICY IF EXISTS app_service_access ON public.%I', tbl);
    EXECUTE format(
      'CREATE POLICY app_service_access ON public.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)',
      tbl
    );

    -- Belt and braces: PostgREST's public roles are never meant to reach these
    -- tables directly. Revoking is independent of RLS and survives policy edits.
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', tbl);
  END LOOP;
END $$;
