-- CN-005 — unguessable public handle for a booking.
--
-- The tracking and confirmation pages used to be addressed by the booking id,
-- which is a serial. Walking id=1..N returned every customer's full name, home
-- address, destination and pickup time from an endpoint with no authentication.
--
-- gen_random_uuid() is built into Postgres 13+, so this needs no extension.
-- Two of them concatenated give 64 hex chars (256 bits) — far beyond guessable.

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "tracking_token" text;

UPDATE "bookings"
   SET "tracking_token" = replace(gen_random_uuid()::text, '-', '')
                       || replace(gen_random_uuid()::text, '-', '')
 WHERE "tracking_token" IS NULL;

-- Unique so a collision surfaces as a write error instead of two bookings
-- silently sharing a public URL.
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_tracking_token_key"
    ON "bookings" ("tracking_token");
