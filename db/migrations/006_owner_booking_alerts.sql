-- Additive preparation only; review and verify on an identified development branch first.
CREATE TABLE public.owner_alert_outbox (
  booking_id UUID PRIMARY KEY REFERENCES public.booking_requests(id),
  recipient TEXT NOT NULL CHECK (recipient ~ '^923[0-9]{9}$'),
  consent JSONB NOT NULL CHECK (jsonb_typeof(consent)='object' AND consent->>'purpose'='owner_booking_alert'),
  template TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','sending','provider_accepted','delivered','failed','ambiguous')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  provider_message_id TEXT UNIQUE CHECK (provider_message_id IS NULL OR (length(provider_message_id)<=506 AND provider_message_id ~ '^wamid\.[A-Za-z0-9+/=_-]{8,}$')),
  error_kind TEXT CHECK (error_kind IN ('failed','ambiguous','status_overdue')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.owner_alert_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.booking_requests(id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  evidence TEXT CHECK (evidence IS NULL OR length(evidence) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Persist only minimal status evidence, never the raw webhook or customer care details.
-- Unknown IDs cover a legitimate callback arriving before the HTTP acceptance is saved.
CREATE TABLE public.owner_alert_events (
  provider_message_id TEXT NOT NULL CHECK (length(provider_message_id)<=506 AND provider_message_id ~ '^wamid\.[A-Za-z0-9+/=_-]{8,}$'),
  recipient TEXT NOT NULL CHECK (recipient ~ '^923[0-9]{9}$'),
  state TEXT NOT NULL CHECK (state IN ('provider_accepted','delivered','failed')),
  provider_timestamp BIGINT NOT NULL CHECK (provider_timestamp > 0),
  error_code INTEGER,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_message_id,recipient,state,provider_timestamp)
);
CREATE INDEX owner_alert_events_received ON public.owner_alert_events(received_at);
ALTER TABLE public.owner_alert_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_alert_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_alert_events ENABLE ROW LEVEL SECURITY;
-- Only the private Worker DB role/table owner may access these tables. No public policies.
CREATE FUNCTION public.guard_owner_alert_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='owner_alert_outbox' AND TG_OP='UPDATE' THEN
    IF NEW.booking_id IS DISTINCT FROM OLD.booking_id OR NEW.recipient IS DISTINCT FROM OLD.recipient
       OR NEW.consent IS DISTINCT FROM OLD.consent OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.template IS DISTINCT FROM OLD.template
       OR NEW.sender_id IS DISTINCT FROM OLD.sender_id THEN
      RAISE EXCEPTION 'Immutable owner alert evidence';
    END IF;
    IF OLD.provider_message_id IS NOT NULL AND NEW.provider_message_id IS DISTINCT FROM OLD.provider_message_id THEN
      RAISE EXCEPTION 'Provider identity is immutable';
    END IF;
    IF NOT ((OLD.state='queued' AND NEW.state='sending' AND NEW.attempts=OLD.attempts+1)
      OR (NEW.attempts=OLD.attempts AND (
        NEW.state=OLD.state
        OR (OLD.state='sending' AND NEW.state IN ('ambiguous','failed','provider_accepted'))
        OR (OLD.state='ambiguous' AND NEW.state IN ('failed','provider_accepted'))
        OR (OLD.state='failed' AND NEW.state='queued' AND OLD.provider_message_id IS NULL)
        OR (OLD.state IN ('provider_accepted','failed') AND NEW.state='delivered' AND NEW.provider_message_id IS NOT NULL)
        OR (OLD.state='provider_accepted' AND NEW.state='failed')
      ))) THEN RAISE EXCEPTION 'Invalid owner alert transition'; END IF;
    IF NEW.state IN ('provider_accepted','delivered') AND NEW.provider_message_id IS NULL THEN
      RAISE EXCEPTION 'Provider evidence is required';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invoice delivery evidence is append only';
END $$;
CREATE TRIGGER owner_alert_outbox_immutable BEFORE UPDATE OR DELETE ON public.owner_alert_outbox
  FOR EACH ROW EXECUTE FUNCTION public.guard_owner_alert_evidence();
CREATE TRIGGER owner_alert_audit_immutable BEFORE UPDATE OR DELETE ON public.owner_alert_audit
  FOR EACH ROW EXECUTE FUNCTION public.guard_owner_alert_evidence();
CREATE TRIGGER owner_alert_events_immutable BEFORE UPDATE OR DELETE ON public.owner_alert_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_owner_alert_evidence();

CREATE INDEX owner_alert_due ON public.owner_alert_outbox(next_attempt_at) WHERE state='queued';
