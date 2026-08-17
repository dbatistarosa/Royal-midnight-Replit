-- What each booking was actually charged, line by line.
--
-- Until now a booking stored one number, price_quoted, and every screen that
-- needed a component of it guessed. The admin revenue report guessed worst:
--
--     totalTaxesCollected = sum(price_quoted) - sum(fare_subtotal)
--
-- fare_subtotal is the *chauffeur commission base*. It deliberately excludes the
-- airport surcharge and the add-ons, because the chauffeur earns on neither. So
-- that subtraction never measured tax — it measured "everything that is not the
-- commission base" and printed it under the heading "Florida tax @ 7.0%". On
-- booking #13 it reported $896.51 of tax on a $1,121.51 sale. Company net
-- income, the revenue-split chart and the exported PDF all inherited it.
--
-- Recording the components at the moment of sale also means a later change to
-- florida_tax_rate or cc_fee_pct cannot retroactively rewrite closed books.
--
--   tax_amount    Florida tax charged on the quote (service + add-ons)
--   card_fee      card processing fee charged on the quote
--   airport_fee   airport surcharge — company revenue, outside the commission base
--   extras_total  add-ons at the prices frozen from extra_services
--
-- The overage_* columns do the same for the extra-time charge raised when an
-- hourly charter runs long. That charge now carries tax and the card fee like
-- any other line, so extra_charge (what the customer pays) and overage_fare
-- (what the chauffeur earns commission on) are no longer the same number and
-- cannot share a column.
--
--   overage_fare      pre-tax extra-time charge — the overtime commission base
--   overage_tax       tax on it
--   overage_card_fee  card fee on it
--   extra_charge_payment_intent_id
--                     the Stripe charge that collected it. NULL after a trip
--                     completes means the money is owed and was not taken —
--                     which, before this migration, was true of every single
--                     extra-time charge ever computed: the amount was shown on
--                     the receipt and never once presented to a card.
--
-- All nullable with no backfill. NULL means "sold before this existed", and the
-- revenue report estimates those rows from the current rates and says so,
-- rather than silently reporting a zero as fact.

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "tax_amount"   numeric(10, 2);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "card_fee"     numeric(10, 2);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "airport_fee"  numeric(10, 2);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "extras_total" numeric(10, 2);

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "overage_fare"     numeric(10, 2);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "overage_tax"      numeric(10, 2);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "overage_card_fee" numeric(10, 2);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "extra_charge_payment_intent_id" text;
