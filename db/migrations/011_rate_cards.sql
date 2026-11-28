-- Additive business pricing. Existing invoice amounts and PDFs remain untouched.
BEGIN;

CREATE TABLE public.rate_cards (
  version integer PRIMARY KEY CHECK (version > 0),
  effective_from timestamptz NOT NULL,
  std_daily integer NOT NULL CHECK (std_daily BETWEEN 500 AND 50000),
  camera_daily integer NOT NULL CHECK (camera_daily BETWEEN 500 AND 50000),
  package_days integer NOT NULL DEFAULT 30 CHECK (package_days = 30),
  package_discount integer NOT NULL CHECK (
    package_discount BETWEEN 0 AND 200000
    AND package_discount < LEAST(std_daily, camera_daily) * package_days
  ),
  km_per_litre numeric NOT NULL CHECK (km_per_litre BETWEEN 3 AND 40 AND scale(km_per_litre) <= 1),
  markup_pct integer NOT NULL CHECK (markup_pct BETWEEN 0 AND 100),
  freshness_hours integer NOT NULL CHECK (freshness_hours BETWEEN 1 AND 168),
  fuel_mode text NOT NULL CHECK (fuel_mode IN ('published', 'fixed')),
  fixed_fuel_pkr numeric,
  fixed_until date,
  fixed_reason text,
  summary text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  withdrawn_at timestamptz,
  withdrawn_by text,
  replaced_by integer REFERENCES public.rate_cards(version) DEFERRABLE INITIALLY DEFERRED,
  CHECK (
    (fuel_mode = 'published' AND fixed_fuel_pkr IS NULL AND fixed_until IS NULL AND fixed_reason IS NULL)
    OR (fuel_mode = 'fixed' AND fixed_fuel_pkr IS NOT NULL AND fixed_fuel_pkr BETWEEN 100 AND 1000
      AND scale(fixed_fuel_pkr) <= 2 AND fixed_until IS NOT NULL AND fixed_reason IS NOT NULL
      AND char_length(btrim(fixed_reason)) BETWEEN 5 AND 120 AND fixed_reason !~ '[[:cntrl:]]'
      AND fixed_until >= (effective_from AT TIME ZONE 'Asia/Karachi')::date)
  ),
  CHECK (
    (withdrawn_at IS NULL AND withdrawn_by IS NULL AND replaced_by IS NULL)
    OR (withdrawn_at IS NOT NULL AND withdrawn_at < effective_from AND withdrawn_by IS NOT NULL
      AND (replaced_by IS NULL OR replaced_by > version))
  )
);

CREATE INDEX rate_cards_effective ON public.rate_cards(effective_from DESC, version DESC)
  WHERE withdrawn_at IS NULL;

CREATE TABLE public.business_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('rate_card.publish', 'rate_card.schedule', 'rate_card.withdraw', 'studio.export')),
  actor text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_audit ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.reject_business_history_rewrite()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Business history is append-only';
END;
$$;

CREATE TRIGGER rate_cards_no_removal BEFORE DELETE OR TRUNCATE ON public.rate_cards
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_business_history_rewrite();
CREATE TRIGGER business_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.business_audit
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_business_history_rewrite();

CREATE FUNCTION public.guard_rate_card_withdrawal()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.withdrawn_at IS NOT NULL OR NEW.withdrawn_at IS NULL
    OR OLD.effective_from <= clock_timestamp()
    OR (to_jsonb(NEW) - ARRAY['withdrawn_at', 'withdrawn_by', 'replaced_by'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['withdrawn_at', 'withdrawn_by', 'replaced_by'])
  THEN
    RAISE EXCEPTION 'Only scheduled rate cards may be withdrawn' USING ERRCODE = 'P0011';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rate_cards_withdraw_only BEFORE UPDATE ON public.rate_cards
  FOR EACH ROW EXECUTE FUNCTION public.guard_rate_card_withdrawal();

INSERT INTO public.rate_cards (
  version, effective_from, std_daily, camera_daily, package_discount,
  km_per_litre, markup_pct, freshness_hours, fuel_mode, summary, created_by
) VALUES (
  3, '2026-11-01T00:00:00+05:00', 2500, 3000, 10000, 12.0, 20, 24,
  'published', 'Current published rates (seed)', 'owner'
);

-- Keep old snapshots nullable. Approved invoices already store their immutable
-- content and PDF. A new approval copies its saved revision's pricing evidence.
ALTER TABLE public.invoice_draft_reviews
  ADD COLUMN rate_card_version integer REFERENCES public.rate_cards(version),
  ADD COLUMN pricing_snapshot jsonb,
  ADD CONSTRAINT invoice_draft_rate_snapshot_pair CHECK (
    (rate_card_version IS NULL AND pricing_snapshot IS NULL)
    OR (rate_card_version IS NOT NULL AND pricing_snapshot IS NOT NULL
      AND jsonb_typeof(pricing_snapshot) = 'object'
      AND pricing_snapshot->'rateCardVersion' IS NOT DISTINCT FROM to_jsonb(rate_card_version))
  );

ALTER TABLE public.approved_invoices
  ADD COLUMN rate_card_version integer REFERENCES public.rate_cards(version),
  ADD COLUMN pricing_snapshot jsonb,
  ADD CONSTRAINT approved_invoice_rate_snapshot_pair CHECK (
    (rate_card_version IS NULL AND pricing_snapshot IS NULL)
    OR (rate_card_version IS NOT NULL AND pricing_snapshot IS NOT NULL
      AND jsonb_typeof(pricing_snapshot) = 'object'
      AND pricing_snapshot->'rateCardVersion' IS NOT DISTINCT FROM to_jsonb(rate_card_version))
  );

-- Project the same JSON evidence into both version-indexed records. Existing
-- writers can keep using their compare-and-swap revision statements.
CREATE FUNCTION public.project_pricing_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME = 'approved_invoices' THEN
    NEW.pricing_snapshot := NEW.snapshot->'review'->'pricingSnapshot';
  ELSE
    NEW.pricing_snapshot := NEW.snapshot->'pricingSnapshot';
  END IF;
  NEW.rate_card_version := (NEW.pricing_snapshot->>'rateCardVersion')::integer;
  RETURN NEW;
END;
$$;

CREATE TRIGGER draft_pricing_snapshot_projection
  BEFORE INSERT OR UPDATE OF snapshot ON public.invoice_draft_reviews
  FOR EACH ROW EXECUTE FUNCTION public.project_pricing_snapshot();
CREATE TRIGGER approved_pricing_snapshot_projection
  BEFORE INSERT ON public.approved_invoices
  FOR EACH ROW EXECUTE FUNCTION public.project_pricing_snapshot();

CREATE TABLE public.invoice_rate_revisions (
  booking_id uuid NOT NULL REFERENCES public.booking_requests(id),
  revision integer NOT NULL CHECK (revision > 0),
  rate_card_version integer NOT NULL REFERENCES public.rate_cards(version),
  pricing_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(pricing_snapshot) = 'object'
    AND pricing_snapshot->'rateCardVersion' IS NOT DISTINCT FROM to_jsonb(rate_card_version)
  ),
  PRIMARY KEY (booking_id, revision)
);
ALTER TABLE public.invoice_rate_revisions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER invoice_rate_revisions_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.invoice_rate_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_business_history_rewrite();

CREATE FUNCTION public.record_pricing_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.rate_card_version IS NOT NULL THEN
    INSERT INTO public.invoice_rate_revisions(booking_id, revision, rate_card_version, pricing_snapshot)
    VALUES (NEW.booking_id, NEW.revision, NEW.rate_card_version, NEW.pricing_snapshot);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER record_pricing_revision
  AFTER INSERT OR UPDATE OF revision ON public.invoice_draft_reviews
  FOR EACH ROW EXECUTE FUNCTION public.record_pricing_revision();

CREATE TRIGGER approved_invoice_rate_snapshot_immutable
  BEFORE UPDATE OF rate_card_version, pricing_snapshot ON public.approved_invoices
  FOR EACH ROW EXECUTE FUNCTION public.reject_business_history_rewrite();

COMMIT;
