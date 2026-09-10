CREATE TABLE IF NOT EXISTS public.booking_adjustments (
  id text PRIMARY KEY,
  booking_id integer NOT NULL REFERENCES public.bookings(id),
  request_hash text NOT NULL,
  snapshot jsonb NOT NULL,
  payment_intent_id text,
  invoice_id text,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);
CREATE INDEX IF NOT EXISTS booking_adjustments_booking_idx ON public.booking_adjustments(booking_id);
ALTER TABLE public.booking_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_adjustments FROM anon, authenticated;
