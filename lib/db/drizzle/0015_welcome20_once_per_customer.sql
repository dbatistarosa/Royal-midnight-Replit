-- WELCOME20 is the public welcome offer: 20% off, once per customer.
-- Older deployments created it before max_uses_per_user existed, leaving the
-- field NULL (unlimited). Make the business rule explicit and idempotent.
UPDATE "promo_codes"
SET "max_uses_per_user" = 1
WHERE lower("code") = 'welcome20'
  AND "max_uses_per_user" IS DISTINCT FROM 1;
