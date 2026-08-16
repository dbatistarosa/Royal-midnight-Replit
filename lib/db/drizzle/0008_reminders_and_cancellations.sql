-- Trip reminders that actually fire, driver release, and cancellations with a reason.
--
-- Booking #6 (pickup 2026-08-14 16:00Z) notified nobody on the day of travel.
-- The cause was not the endpoint or the secret: sendTripReminders() only acted
-- on bookings inside a 10-MINUTE window (55-65 min before pickup), and the
-- GitHub Actions workflow that drives it — scheduled `*/10` — actually fires
-- every 40 to 73 minutes. GitHub queues scheduled workflows best-effort and
-- routinely delays or skips them. The job reported success every run; it simply
-- never found anything inside the window.
--
-- The replacement is due-based rather than window-based: "is it within 24h /
-- 2h of pickup AND has that reminder not been sent yet". That is idempotent and
-- catches up on its own no matter how late the scheduler is, which is why each
-- stage needs its own sent-at marker.

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "reminder_24h_sent_at" timestamptz;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "reminder_2h_sent_at"  timestamptz;

-- Set when the assigned driver failed to confirm in time and was unassigned, so
-- the release is auditable and cannot be applied twice.
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "driver_released_at" timestamptz;

-- Cancellation bookkeeping. The reason drives the refund: anything that is our
-- failure refunds in full, while a customer-requested cancellation falls back to
-- the existing 12h/2h fee policy.
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "cancellation_reason" text;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "cancellation_notes"  text;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "cancelled_by"        text;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "cancelled_at"        timestamptz;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refund_amount"       numeric(10,2);

-- Partial indexes: the reminder sweep runs every minute and only ever looks for
-- rows that still need work, so the index only has to cover those.
CREATE INDEX IF NOT EXISTS "bookings_reminder_24h_pending_idx"
    ON "bookings" ("pickup_at") WHERE "reminder_24h_sent_at" IS NULL;
CREATE INDEX IF NOT EXISTS "bookings_reminder_2h_pending_idx"
    ON "bookings" ("pickup_at") WHERE "reminder_2h_sent_at" IS NULL;

-- A booking the driver was removed from must never be offered back to them.
CREATE TABLE IF NOT EXISTS "booking_driver_blocks" (
    "id"         serial PRIMARY KEY,
    "booking_id" integer NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
    "driver_id"  integer NOT NULL REFERENCES "drivers"("id")  ON DELETE CASCADE,
    "reason"     text NOT NULL DEFAULT 'no_confirmation',
    "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "booking_driver_blocks_booking_driver_unique"
    ON "booking_driver_blocks" ("booking_id", "driver_id");
CREATE INDEX IF NOT EXISTS "booking_driver_blocks_driver_idx"
    ON "booking_driver_blocks" ("driver_id");

-- Non-compliance history. Kept as rows rather than a counter on drivers so the
-- admin can see which trips caused them; the three-strike suspension counts
-- these.
CREATE TABLE IF NOT EXISTS "driver_warnings" (
    "id"         serial PRIMARY KEY,
    "driver_id"  integer NOT NULL REFERENCES "drivers"("id") ON DELETE CASCADE,
    "booking_id" integer REFERENCES "bookings"("id") ON DELETE SET NULL,
    "reason"     text NOT NULL,
    "notes"      text,
    "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "driver_warnings_driver_idx"
    ON "driver_warnings" ("driver_id");

-- Same posture as migration 0005: RLS on, no policies, no grants to the
-- Supabase anon/authenticated roles.
ALTER TABLE "booking_driver_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "driver_warnings"       ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "booking_driver_blocks" FROM anon, authenticated;
REVOKE ALL ON TABLE "driver_warnings"       FROM anon, authenticated;
