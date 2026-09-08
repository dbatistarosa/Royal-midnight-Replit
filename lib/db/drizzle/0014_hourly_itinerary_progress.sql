-- Durable, ordered progress for hourly-charter stops and final destination.
-- Created manually because the Supabase CLI is not installed in this workspace.
CREATE TABLE IF NOT EXISTS "booking_itinerary_stops" (
  "id" serial PRIMARY KEY,
  "booking_id" integer NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL,
  "kind" text NOT NULL CHECK ("kind" IN ('stop', 'final')),
  "address" text NOT NULL,
  "lat" numeric(10,7),
  "lng" numeric(10,7),
  "arrived_at" timestamptz,
  "departed_at" timestamptz,
  "arrived_by_driver_id" integer REFERENCES "drivers"("id") ON DELETE SET NULL,
  "departed_by_driver_id" integer REFERENCES "drivers"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "booking_itinerary_stops_sequence_nonnegative" CHECK ("sequence" >= 0),
  CONSTRAINT "booking_itinerary_stops_departure_after_arrival" CHECK ("departed_at" IS NULL OR "arrived_at" IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_itinerary_stops_booking_sequence_unique"
  ON "booking_itinerary_stops" ("booking_id", "sequence");
CREATE INDEX IF NOT EXISTS "booking_itinerary_stops_booking_progress_idx"
  ON "booking_itinerary_stops" ("booking_id", "arrived_at");

ALTER TABLE "booking_itinerary_stops" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "booking_itinerary_stops" FROM anon, authenticated;
REVOKE ALL ON SEQUENCE "booking_itinerary_stops_id_seq" FROM anon, authenticated;

-- Initial operating market. The polygon follows Florida's southeast corridor
-- from Miami through Stuart; destinations remain unrestricted. Existing
-- chauffeurs are assigned because the current fleet operates only here. Future
-- markets are created and staffed independently in Geo Zones.
INSERT INTO "geo_zones" ("name", "description", "type", "geometry", "rate_multiplier", "is_service_area", "is_active")
SELECT
  'South Florida — Miami to Stuart',
  'Pickup service area for the southeast Florida corridor',
  'polygon',
  '{"coordinates":[[-80.45,25.15],[-80.00,25.15],[-79.95,27.30],[-80.65,27.30],[-80.45,25.15]]}',
  1.0,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "geo_zones" WHERE lower("name") LIKE '%south florida%' AND "is_service_area" = true
);

-- Normalize a pre-existing South Florida preset as well. The legacy 75 km
-- circle reaches Miami/Fort Lauderdale but not Stuart, so leaving it in place
-- would reject valid pickups at the northern end of the operating corridor.
UPDATE "geo_zones"
SET
  "name" = 'South Florida — Miami to Stuart',
  "description" = 'Pickup service area for the southeast Florida corridor',
  "type" = 'polygon',
  "geometry" = '{"coordinates":[[-80.45,25.15],[-80.00,25.15],[-79.95,27.30],[-80.65,27.30],[-80.45,25.15]]}',
  "is_service_area" = true,
  "is_active" = true,
  "updated_at" = now()
WHERE lower("name") LIKE '%south florida%' AND "is_service_area" = true;

INSERT INTO "driver_service_zones" ("driver_id", "zone_id")
SELECT d."id", z."id"
FROM "drivers" d
JOIN "geo_zones" z ON lower(z."name") LIKE '%south florida%' AND z."is_service_area" = true AND z."is_active" = true
WHERE d."approval_status" = 'approved' AND d."compliance_hold" = false
ON CONFLICT ("driver_id", "zone_id") DO NOTHING;
