ALTER TABLE public.app_jobs ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS stripe_invoice_id text;
CREATE INDEX IF NOT EXISTS app_jobs_due_idx ON public.app_jobs(status,available_at);
CREATE UNIQUE INDEX IF NOT EXISTS users_normalized_email_unique ON public.users(lower(trim(email)));
CREATE OR REPLACE FUNCTION public.reset_email_verification() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN
 IF lower(trim(NEW.email)) IS DISTINCT FROM lower(trim(OLD.email)) THEN NEW.email_verified_at=NULL; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reset_email_verification ON public.users;
CREATE TRIGGER reset_email_verification BEFORE UPDATE OF email ON public.users FOR EACH ROW EXECUTE FUNCTION public.reset_email_verification();
REVOKE ALL ON FUNCTION public.reset_email_verification() FROM PUBLIC,anon,authenticated;
