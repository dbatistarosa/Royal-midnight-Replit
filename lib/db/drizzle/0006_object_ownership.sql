-- Storage ACL — record who owns each private object.
--
-- (Cyber Neo 2026-08-13 CN-001. Note the report reuses the CN-xxx numbering of
-- the 2026-08-09 audit for different findings; the in-code comments elsewhere
-- refer to the older numbering.)
--
-- Closing the anonymous hole earlier was only half the job: /storage/sign would
-- still sign ANY object path for ANY logged-in session, so a passenger who
-- registered a minute ago could download a driver's licence, insurance
-- certificate and vehicle registration given the UUID. lib/objectAcl.ts was
-- written to prevent exactly this and was never called from anywhere.
--
-- Ownership is now recorded when the upload URL is handed out. This backfills
-- the objects that already exist by tracing them back through the tables that
-- reference them. Anything that cannot be traced deliberately ends up with no
-- row, which means admin-only — fail closed.

CREATE TABLE IF NOT EXISTS "object_owners" (
    "id"            serial PRIMARY KEY,
    "object_path"   text NOT NULL,
    "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "created_at"    timestamptz NOT NULL DEFAULT now()
);

-- Named the way drizzle-kit names a column-level .unique(), so a future
-- generated diff does not try to recreate it.
CREATE UNIQUE INDEX IF NOT EXISTS "object_owners_object_path_unique"
    ON "object_owners" ("object_path");

CREATE INDEX IF NOT EXISTS "object_owners_owner_idx"
    ON "object_owners" ("owner_user_id");

-- Backfill: every object referenced by a driver row or a compliance submission
-- belongs to the user behind that driver. Paths are normalised to the internal
-- `/objects/<key>` form the storage routes compare against.
INSERT INTO "object_owners" ("object_path", "owner_user_id")
SELECT DISTINCT ON (regexp_replace(src.path, '^/?(objects/)?', ''))
       '/objects/' || regexp_replace(src.path, '^/?(objects/)?', ''),
       src.user_id
  FROM (
        SELECT "user_id", "license_doc"     AS path FROM "drivers" WHERE "license_doc"     IS NOT NULL
        UNION ALL
        SELECT "user_id", "reg_doc"         AS path FROM "drivers" WHERE "reg_doc"         IS NOT NULL
        UNION ALL
        SELECT "user_id", "insurance_doc"   AS path FROM "drivers" WHERE "insurance_doc"   IS NOT NULL
        UNION ALL
        SELECT "user_id", "profile_picture" AS path FROM "drivers" WHERE "profile_picture" IS NOT NULL
       ) AS src(user_id, path)
 WHERE src.user_id IS NOT NULL
   AND src.path <> ''
   -- Only our own storage keys. A driver-supplied absolute URL is not an object
   -- we host and must never be granted an owner row.
   AND src.path NOT ILIKE 'http%'
ON CONFLICT ("object_path") DO NOTHING;

INSERT INTO "object_owners" ("object_path", "owner_user_id")
SELECT DISTINCT ON (regexp_replace(cd."file_url", '^/?(objects/)?', ''))
       '/objects/' || regexp_replace(cd."file_url", '^/?(objects/)?', ''),
       d."user_id"
  FROM "compliance_documents" cd
  JOIN "drivers" d ON d."id" = cd."driver_id"
 WHERE d."user_id" IS NOT NULL
   AND cd."file_url" <> ''
   AND cd."file_url" NOT ILIKE 'http%'
ON CONFLICT ("object_path") DO NOTHING;

-- Same posture as migration 0005: RLS on, no policies, no grants to the
-- Supabase anon/authenticated roles. Only the API's owner role reaches it.
ALTER TABLE "object_owners" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "object_owners" FROM anon, authenticated;
