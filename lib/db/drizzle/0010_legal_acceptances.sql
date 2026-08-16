-- Who agreed to what, when, and from where.
--
-- The site had Terms and a Privacy Policy as pages, but nothing recorded a
-- passenger accepting them at booking time, and there was no chauffeur
-- agreement at all — drivers were onboarded, approved and dispatched without
-- ever being shown terms. An agreement nobody can prove was accepted is not
-- much of an agreement.
--
-- One table rather than a timestamp column per document: it records WHICH
-- VERSION was accepted, so amending a document later cannot silently claim that
-- everyone had agreed to the new wording. A new table also ships safely ahead
-- of its migration, which a new column on bookings or drivers does not — see
-- the note in lib/db/src/schema/bookings.ts.
--
-- No foreign keys on the subject columns on purpose: an acceptance is evidence
-- and must survive the deletion of the account it refers to, which is also why
-- the email is denormalised alongside it.

CREATE TABLE IF NOT EXISTS "legal_acceptances" (
    "id"               serial PRIMARY KEY,
    "document_type"    text NOT NULL,
    "document_version" text NOT NULL,
    "user_id"          integer,
    "driver_id"        integer,
    "booking_id"       integer,
    "email"            text,
    "accepted_at"      timestamptz NOT NULL DEFAULT now(),
    "ip_address"       text,
    "user_agent"       text
);

CREATE INDEX IF NOT EXISTS "legal_acceptances_user_idx"    ON "legal_acceptances" ("user_id");
CREATE INDEX IF NOT EXISTS "legal_acceptances_driver_idx"  ON "legal_acceptances" ("driver_id");
CREATE INDEX IF NOT EXISTS "legal_acceptances_booking_idx" ON "legal_acceptances" ("booking_id");

-- Same posture as migrations 0005, 0008 and 0009: RLS on, no policies, no
-- grants to the Supabase anon/authenticated roles. The API reaches this table
-- with the service credentials only.
ALTER TABLE "legal_acceptances" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "legal_acceptances" FROM anon, authenticated;
