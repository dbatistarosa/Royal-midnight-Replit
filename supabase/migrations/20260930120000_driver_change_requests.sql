CREATE TABLE IF NOT EXISTS public.driver_change_requests (
  id serial PRIMARY KEY,
  driver_id integer NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewed_by integer
);

CREATE INDEX IF NOT EXISTS driver_change_requests_driver_status_idx
  ON public.driver_change_requests (driver_id, status);

ALTER TABLE public.driver_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.driver_change_requests FROM anon, authenticated;
