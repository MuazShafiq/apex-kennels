-- Additive correction ledger. Apply only with separate production DDL approval.
-- Original approved snapshots and issued PDF bytes remain immutable.
CREATE TABLE public.invoice_corrections (
  invoice_id uuid PRIMARY KEY REFERENCES public.approved_invoices(id),
  kind text NOT NULL CHECK (kind IN ('cancel','replace')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
  replacement_number text UNIQUE CHECK (replacement_number ~ '^[0-9]{4}$'),
  replacement_reference text CHECK (length(replacement_reference) BETWEEN 1 AND 200),
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind='cancel' AND replacement_number IS NULL AND replacement_reference IS NULL)
    OR (kind='replace' AND replacement_number IS NOT NULL AND replacement_reference IS NOT NULL))
);
ALTER TABLE public.invoice_corrections ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER invoice_correction_immutable BEFORE UPDATE OR DELETE ON public.invoice_corrections
FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_audit();
