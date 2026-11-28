-- Booking cutover catalog readback. No application rows, writes or provider calls.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL search_path = pg_catalog;

SELECT current_database() AS database, current_user AS reader, clock_timestamp() AS checked_at;

WITH targets AS (
  SELECT to_regclass('public.booking_requests') AS bookings,
         to_regclass('public.booking_whatsapp_consents') AS consent,
         to_regclass('public.booking_pets') AS pets,
         to_regclass('public.booking_stay_history') AS history,
         to_regrole(:'runtime_role') AS runtime
), evidence AS (
  SELECT
    (SELECT jsonb_build_object('validated', convalidated, 'type', contype,
                              'definition', pg_get_constraintdef(oid))
     FROM pg_constraint WHERE conrelid = consent
       AND conname = 'booking_whatsapp_consents_consent_text_version_check') AS consent_check,
    (SELECT jsonb_build_object('type', format_type(atttypid, atttypmod), 'required', attnotnull)
     FROM pg_attribute WHERE attrelid = pets AND attname = 'care_details'
       AND attnum > 0 AND NOT attisdropped) AS care_column,
    (SELECT jsonb_build_object('validated', convalidated, 'type', contype,
                              'definition', pg_get_constraintdef(oid))
     FROM pg_constraint WHERE conrelid = pets
       AND conname = 'booking_pets_care_details_object') AS care_check,
    (SELECT jsonb_build_object('ordinary_table', relkind = 'r', 'rls', relrowsecurity,
                              'force_rls', relforcerowsecurity,
                              'policies', (SELECT count(*) FROM pg_policy WHERE polrelid = history))
     FROM pg_class WHERE oid = history) AS history_access,
    (SELECT jsonb_agg(jsonb_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
                                       'required', a.attnotnull, 'default', pg_get_expr(d.adbin, d.adrelid))
                      ORDER BY a.attnum)
     FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = history AND a.attnum > 0 AND NOT a.attisdropped) AS history_columns,
    (SELECT jsonb_agg(jsonb_build_object('name', conname, 'type', contype, 'validated', convalidated,
                                       'definition', pg_get_constraintdef(oid)) ORDER BY conname)
     FROM pg_constraint WHERE conrelid = history) AS history_constraints,
    (SELECT jsonb_build_object('enabled', t.tgenabled, 'definition', pg_get_triggerdef(t.oid),
                              'security_definer', p.prosecdef, 'function_config', p.proconfig,
                              'function_body', btrim(p.prosrc))
     FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE t.tgrelid = history AND NOT t.tgisinternal
       AND t.tgname = 'booking_stay_history_immutable') AS history_guard,
    (SELECT jsonb_build_object(
       'role', r.rolname,
       'public_schema_usage', has_schema_privilege(r.oid, 'public', 'USAGE'),
       'bookings_select', has_table_privilege(r.oid, bookings, 'SELECT'),
       'bookings_update_status', has_column_privilege(r.oid, bookings, (SELECT attnum FROM pg_attribute
         WHERE attrelid = bookings AND attname = 'status' AND NOT attisdropped), 'UPDATE'),
       'pets_select_care', has_column_privilege(r.oid, pets, (SELECT attnum FROM pg_attribute
         WHERE attrelid = pets AND attname = 'care_details' AND NOT attisdropped), 'SELECT'),
       'pets_insert_care', has_column_privilege(r.oid, pets, (SELECT attnum FROM pg_attribute
         WHERE attrelid = pets AND attname = 'care_details' AND NOT attisdropped), 'INSERT'),
       'history_select', has_table_privilege(r.oid, history, 'SELECT'),
       'history_insert', has_table_privilege(r.oid, history, 'INSERT'),
       'history_rls_bypass', r.rolsuper OR r.rolbypassrls
         OR (NOT c.relforcerowsecurity AND pg_has_role(r.oid, c.relowner, 'USAGE')))
     FROM pg_roles r LEFT JOIN pg_class c ON c.oid = history WHERE r.oid = runtime) AS runtime_access
  FROM targets
)
SELECT jsonb_pretty(to_jsonb(evidence)) AS booking_schema FROM evidence;

COMMIT;
