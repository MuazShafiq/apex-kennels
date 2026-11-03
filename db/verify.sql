-- Read-only post-deployment checks for the dedicated Apex database.
-- Run after reviewing and applying db/schema.sql.
-- Fails if tables are missing or RLS is not enabled.
DO $$
DECLARE
  table_count integer;
  protected_count integer;
BEGIN
  SELECT count(*) INTO table_count
  FROM pg_tables
  WHERE schemaname='public' AND tablename IN (
    'customers', 'pets', 'booking_requests', 'booking_pets',
    'booking_extras', 'pricing_versions', 'promotions', 'invoices',
    'invoice_lines', 'invoice_discounts', 'form_ingestion_events'
  );
  IF table_count <> 11 THEN
    RAISE EXCEPTION 'Apex schema incomplete: found % / 11 expected tables', table_count;
  END IF;

  SELECT count(*) INTO protected_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relname IN (
    'customers', 'pets', 'booking_requests', 'booking_pets',
    'booking_extras', 'pricing_versions', 'promotions', 'invoices',
    'invoice_lines', 'invoice_discounts', 'form_ingestion_events'
  ) AND c.relrowsecurity;
  IF protected_count <> 11 THEN
    RAISE EXCEPTION 'RLS not enabled for all tables: found % / 11', protected_count;
  END IF;

  RAISE NOTICE 'Apex schema check passed: 11 expected tables, all with RLS enabled';
END $$;
