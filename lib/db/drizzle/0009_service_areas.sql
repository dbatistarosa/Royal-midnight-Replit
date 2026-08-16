-- Geo zones become service areas, and bookings remember where they start.
--
-- Two long-standing gaps close together here.
--
-- 1. drivers.service_area was a single free-text label picked once during
--    onboarding and read by absolutely nothing: it filtered no query and gated
--    no pool, so every approved chauffeur in Florida saw every trip in Florida.
--    A driver also normally covers more than one metro (South Florida
--    MIA/FLL/PBI, Tampa TPA/PIE/SRQ, Orlando MCO/SFB), which one text column
--    cannot express. geo_zones already had the geometry and the point-in-zone
--    maths for pricing surcharges, so zones gain a second role rather than a
--    parallel table being invented for the same shapes.
--
-- 2. Bookings stored addresses but never coordinates, so "is this trip inside
--    that driver's area?" would have meant geocoding every pending booking on
--    every pool refresh — a Mapbox call per row per poll. The pickup point is
--    geocoded once at booking time and kept.

ALTER TABLE "geo_zones" ADD COLUMN IF NOT EXISTS "is_service_area" boolean NOT NULL DEFAULT false;

-- Cached pickup coordinates. Nullable on purpose: rows created before this
-- migration have none, geocoding is best-effort, and a trip whose location is
-- unknown must still reach drivers (see the fallback in the pool query) rather
-- than silently disappearing from everyone's list.
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "pickup_lat" numeric(10,7);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "pickup_lng" numeric(10,7);

-- Which chauffeurs work which areas. Many-to-many; deleting either side removes
-- the assignment rather than orphaning it.
CREATE TABLE IF NOT EXISTS "driver_service_zones" (
    "id"         serial PRIMARY KEY,
    "driver_id"  integer NOT NULL REFERENCES "drivers"("id")   ON DELETE CASCADE,
    "zone_id"    integer NOT NULL REFERENCES "geo_zones"("id") ON DELETE CASCADE,
    "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "driver_service_zones_driver_zone_unique"
    ON "driver_service_zones" ("driver_id", "zone_id");
CREATE INDEX IF NOT EXISTS "driver_service_zones_zone_idx"
    ON "driver_service_zones" ("zone_id");

-- Same posture as migrations 0005 and 0008: RLS on, no policies, no grants to
-- the Supabase anon/authenticated roles. The API reaches this table with the
-- service credentials only.
ALTER TABLE "driver_service_zones" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "driver_service_zones" FROM anon, authenticated;
