-- Which add-ons the chauffeur keeps, and the hourly overage the trip actually ran.
--
-- 1. extra_services.paid_to_driver
--    Some add-ons are work the chauffeur personally does or equipment they
--    supply — carrying a pet, fitting a child seat — and the operator pays
--    those to them in full, with no commission taken. Champagne and flowers are
--    goods the company buys, so they are not. Until now the split did not exist
--    at all: driver earnings were commission on the fare subtotal, and extras
--    were excluded entirely, so a chauffeur fitting a car seat was paid nothing
--    for it.
--
--    A column rather than a hardcoded list of ids, because it is a business
--    decision the operator changes from the Extras screen, and because matching
--    on a name breaks the moment one is renamed.
--
-- 2. bookings.overage_minutes
--    trip/complete already added bookings.extra_charge to the total and the
--    completion email already had a line for it — but nothing ever computed it.
--    The hourly timer fields (trip_started_at, hourly_rate, max_miles_per_hour)
--    were frozen onto the row at trip start "so the cron can compute overage",
--    and that cron was never written. Charters ran over and nobody was billed.
--
--    Storing the minutes alongside the money makes the charge explainable to a
--    customer who queries it, instead of an unsourced dollar amount.

ALTER TABLE "extra_services" ADD COLUMN IF NOT EXISTS "paid_to_driver" boolean NOT NULL DEFAULT false;

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "overage_minutes" integer;

-- Seed the two the operator named. Matched on the current names, and only where
-- the flag is still at its default, so re-running this cannot undo a later
-- change made from the admin screen.
UPDATE "extra_services"
   SET "paid_to_driver" = true
 WHERE "paid_to_driver" = false
   AND (lower("name") LIKE '%pet%' OR lower("name") LIKE '%car seat%' OR lower("name") LIKE '%carseat%');
