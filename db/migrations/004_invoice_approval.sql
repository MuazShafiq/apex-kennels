-- Additive, private invoice lifecycle. Review and apply on a development branch first.
-- No production rollout, numbering seed, bank data or flags are changed here.
CREATE TABLE public.approved_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.booking_requests(id),
  invoice_number text NOT NULL UNIQUE CHECK (invoice_number ~ '^[0-9]{4}$'),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','issued')),
  approved_at timestamptz NOT NULL DEFAULT now(),
  issued_at timestamptz,
  pdf_bytes bytea,
  pdf_sha256 text,
  CONSTRAINT issued_pdf_complete CHECK (
    (status='approved' AND issued_at IS NULL AND pdf_bytes IS NULL AND pdf_sha256 IS NULL)
    OR (status='issued' AND issued_at IS NOT NULL AND pdf_bytes IS NOT NULL AND pdf_sha256 IS NOT NULL
      AND octet_length(pdf_bytes) BETWEEN 1000 AND 2000000 AND pdf_sha256 ~ '^[a-f0-9]{64}$')
  )
);
CREATE TABLE public.invoice_approval_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.approved_invoices(id),
  action text NOT NULL CHECK (action IN ('approved','issued')),
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(invoice_id,action)
);
ALTER TABLE public.approved_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_approval_audit ENABLE ROW LEVEL SECURITY;
-- No public or authenticated policies: only the privileged Worker backend.
CREATE FUNCTION public.guard_approved_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Approved invoices are immutable'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
    OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at OR OLD.status<>'approved' OR NEW.status<>'issued'
  THEN RAISE EXCEPTION 'Invalid invoice transition'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approved_invoice_immutable BEFORE UPDATE OR DELETE ON public.approved_invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_approved_invoice();
CREATE FUNCTION public.guard_invoice_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Invoice audit is append-only'; END $$;
CREATE TRIGGER invoice_audit_immutable BEFORE UPDATE OR DELETE ON public.invoice_approval_audit
FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_audit();
