-- Add route estimate columns to bookings for driver scheduling conflict detection
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "estimated_duration_minutes" integer;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "estimated_distance_miles" numeric(6, 2);
