-- Additive. Apply only after reviewed deployment and before enabling
-- APEX_STAFF_DRAFTS_ENABLED. No live table is modified here.
-- Internal estimates only. No invoices are issued or payable.
CREATE TABLE IF NOT EXISTS public.invoice_draft_reviews (
  booking_id UUID PRIMARY KEY REFERENCES public.booking_requests(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 1000000),
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
