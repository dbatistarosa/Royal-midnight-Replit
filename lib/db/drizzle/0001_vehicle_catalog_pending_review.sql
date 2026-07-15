ALTER TABLE "vehicle_catalog" ADD COLUMN IF NOT EXISTS "pending_review" boolean NOT NULL DEFAULT false;
