-- Additive preparation only; review and verify on an identified development branch first.
CREATE TABLE public.invoice_delivery_outbox (
  invoice_id UUID PRIMARY KEY REFERENCES public.approved_invoices(id),
  recipient TEXT NOT NULL CHECK (recipient ~ '^923[0-9]{9}$'),
  consent JSONB NOT NULL CHECK (jsonb_typeof(consent)='object' AND consent->>'purpose'='invoice_pdf'),
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','sending','provider_accepted','delivered','failed','ambiguous')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  provider_message_id TEXT UNIQUE CHECK (provider_message_id IS NULL OR (length(provider_message_id)<=506 AND provider_message_id ~ '^wamid\.[A-Za-z0-9+/=_-]{8,}$')),
  error_kind TEXT CHECK (error_kind IN ('failed','ambiguous')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.invoice_delivery_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.approved_invoices(id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  evidence TEXT CHECK (evidence IS NULL OR length(evidence) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Persist only minimal status evidence, never the raw webhook or customer care details.
-- Unknown IDs cover a legitimate callback arriving before the HTTP acceptance is saved.
CREATE TABLE public.invoice_delivery_events (
  provider_message_id TEXT NOT NULL CHECK (length(provider_message_id)<=506 AND provider_message_id ~ '^wamid\.[A-Za-z0-9+/=_-]{8,}$'),
  recipient TEXT NOT NULL CHECK (recipient ~ '^923[0-9]{9}$'),
  state TEXT NOT NULL CHECK (state IN ('provider_accepted','delivered','failed')),
  provider_timestamp BIGINT NOT NULL CHECK (provider_timestamp > 0),
  error_code INTEGER,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_message_id,recipient,state,provider_timestamp)
);
CREATE INDEX invoice_delivery_events_received ON public.invoice_delivery_events(received_at);
ALTER TABLE public.invoice_delivery_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_delivery_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_delivery_events ENABLE ROW LEVEL SECURITY;
-- Only the private Worker DB role/table owner may access these tables. No public policies.
CREATE FUNCTION public.guard_invoice_delivery_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='invoice_delivery_outbox' AND TG_OP='UPDATE' THEN
    IF NEW.invoice_id IS DISTINCT FROM OLD.invoice_id OR NEW.recipient IS DISTINCT FROM OLD.recipient
       OR NEW.consent IS DISTINCT FROM OLD.consent OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Immutable invoice delivery evidence';
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
      ))) THEN RAISE EXCEPTION 'Invalid invoice delivery transition'; END IF;
    IF NEW.state IN ('provider_accepted','delivered') AND NEW.provider_message_id IS NULL THEN
      RAISE EXCEPTION 'Provider evidence is required';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invoice delivery evidence is append only';
END $$;
CREATE TRIGGER invoice_delivery_outbox_immutable BEFORE UPDATE OR DELETE ON public.invoice_delivery_outbox
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_delivery_evidence();
CREATE TRIGGER invoice_delivery_audit_immutable BEFORE UPDATE OR DELETE ON public.invoice_delivery_audit
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_delivery_evidence();
CREATE TRIGGER invoice_delivery_events_immutable BEFORE UPDATE OR DELETE ON public.invoice_delivery_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_delivery_evidence();
