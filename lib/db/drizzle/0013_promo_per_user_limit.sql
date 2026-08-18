-- How many times ONE person may use a promo code.
--
-- promo_codes.max_uses has always capped the code globally: "the first 50
-- redemptions and then it stops". There was no way to express the far more
-- common offer — "$20 off, once per customer" — so a single passenger could
-- burn the whole allocation on their own bookings.
--
-- NULL means unlimited per person, which is exactly the behaviour every
-- existing code has today, so no backfill and nothing changes for them.
--
-- Enforcement counts the passenger's own bookings carrying this code
-- (bookings.promo_code + bookings.user_id) rather than adding a redemption
-- table: the booking row is already the record of a redemption, and a second
-- source of truth would be one more thing to keep in step. Cancelled bookings
-- still count, deliberately — otherwise book-and-cancel farms the offer.
--
-- A code with a per-person limit can only be honoured for a signed-in
-- passenger; an anonymous checkout has no identity to count against, so the
-- server refuses it and says to sign in rather than silently letting the limit
-- be bypassed.

ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "max_uses_per_user" integer;

-- The count above scans bookings by code and user on every validation.
CREATE INDEX IF NOT EXISTS "bookings_promo_code_user_idx"
  ON "bookings" ("promo_code", "user_id")
  WHERE "promo_code" IS NOT NULL;
