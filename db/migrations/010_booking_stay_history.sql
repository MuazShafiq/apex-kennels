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
  CHECK (vaccination_attested = (action = 'approve')),
  CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 1 AND 250),
  CONSTRAINT booking_stay_history_transition_check CHECK (
    (action = 'start_review' AND prior_status = 'requested' AND new_status = 'reviewing') OR
    (action = 'approve' AND prior_status = 'reviewing' AND new_status = 'approved') OR
    (action = 'decline' AND prior_status = 'reviewing' AND new_status = 'declined') OR
    (action = 'check_in' AND prior_status = 'approved' AND new_status = 'approved') OR
    (action = 'check_out' AND prior_status = 'approved' AND new_status = 'completed')
  )
);
ALTER TABLE public.booking_stay_history ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.reject_booking_stay_history_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Booking stay history is append-only';
END;
$$;
CREATE TRIGGER booking_stay_history_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.booking_stay_history
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_booking_stay_history_change();
COMMIT;
