-- Add Stripe customer tracking to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "default_payment_method_id" text;

-- Add tip columns to bookings
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "tip_amount" numeric(10, 2);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "tip_payment_intent_id" text;
