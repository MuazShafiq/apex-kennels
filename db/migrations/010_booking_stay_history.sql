BEGIN;
CREATE TABLE public.booking_stay_history (
  booking_id uuid NOT NULL REFERENCES public.booking_requests(id),
  revision integer NOT NULL CHECK (revision > 0),
  action text NOT NULL CHECK (action IN ('start_review','approve','decline','check_in','check_out')),
  prior_status text NOT NULL,
  new_status text NOT NULL,
  actor text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason text,
  vaccination_attested boolean NOT NULL DEFAULT false,
  PRIMARY KEY (booking_id, revision),
  UNIQUE (booking_id, action),
  CHECK ((action = 'decline') = (reason IS NOT NULL)),
  CHECK (NOT vaccination_attested OR action = 'approve')
);
ALTER TABLE public.booking_stay_history ENABLE ROW LEVEL SECURITY;
COMMIT;
