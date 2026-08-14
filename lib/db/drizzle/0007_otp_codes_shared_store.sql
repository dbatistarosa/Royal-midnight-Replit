-- Move SMS login codes out of process memory.
--
-- otp_codes has existed since the first migration and was never written to:
-- the codes lived in a module-level Map in routes/auth.ts. On Vercel that is
-- broken two ways. Functionally, each instance keeps its own Map, so a verify
-- can land on an instance that never saw the send and login by SMS fails at
-- random. For security, MAX_OTP_ATTEMPTS was counted per instance, so the real
-- ceiling on guesses against one code was 5 x however many instances were warm.
--
-- The stored value becomes the SHA-256 of the code rather than the code, so a
-- read of this table does not yield a working login factor.
--
-- The table is empty (nothing has ever inserted into it), so this rewrites the
-- shape rather than migrating data.

DELETE FROM "otp_codes";

ALTER TABLE "otp_codes" DROP COLUMN IF EXISTS "otp";
ALTER TABLE "otp_codes" ADD COLUMN IF NOT EXISTS "otp_hash" text NOT NULL;
ALTER TABLE "otp_codes" ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 0;

-- One live code per phone: send-otp upserts on this, which also makes issuing a
-- new code reset the attempt counter in a single statement.
CREATE UNIQUE INDEX IF NOT EXISTS "otp_codes_phone_unique" ON "otp_codes" ("phone");

-- Same posture as migration 0005.
ALTER TABLE "otp_codes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "otp_codes" FROM anon, authenticated;
