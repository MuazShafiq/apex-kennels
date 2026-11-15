/** Preparation only: no database client, credentials, network or SQL execution. */
import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const migrations = [
  ['004_invoice_approval.sql','e47be8e34c3cef212fd79f4af8d7a844951ffab5e3159de1507c77904f70b568'],
  ['005_invoice_delivery.sql','e6ab0eed51e383ebb9a7e1a0f04a28a0cfcf2cf8bd699fadf07b209e1d241f2a'],
  ['006_owner_booking_alerts.sql','ca764706012b853d782a1deb911b150eba90ff9fa292bf4bed6e9c2dc5900f0b'],
];
const tables = ['approved_invoices','invoice_approval_audit','invoice_delivery_outbox',
  'invoice_delivery_audit','invoice_delivery_events','owner_alert_outbox','owner_alert_audit','owner_alert_events'];
const functions = ['guard_approved_invoice','guard_invoice_audit','guard_invoice_delivery_evidence','guard_owner_alert_evidence'];
const triggers = ['approved_invoice_immutable','invoice_audit_immutable','invoice_delivery_outbox_immutable',
  'invoice_delivery_audit_immutable','invoice_delivery_events_immutable','owner_alert_outbox_immutable',
  'owner_alert_audit_immutable','owner_alert_events_immutable'];
const indexes = ['invoice_delivery_events_received','owner_alert_events_received','owner_alert_due'];
const literals = values => values.map(value => "'"+value.replaceAll("'","''")+"'").join(',');
const sqlArray = values => 'ARRAY['+literals(values)+']';
const publicClasses = `SELECT c.oid,c.relname,c.relkind,c.relowner FROM pg_class c WHERE c.relnamespace='public'::regnamespace`;

function identity(database, role) {
  return `DO $apex$ BEGIN
  IF current_database()<>${literals([database])} OR current_user<>${literals([role])}
    OR session_user<>current_user THEN RAISE EXCEPTION 'Unexpected database or role'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname=current_database() AND datdba=current_user::regrole)
    OR (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user)
    THEN RAISE EXCEPTION 'Expected non-superuser database owner without BYPASSRLS'; END IF;
END $apex$;`;
}

// Catalog-only checks: no customer records or outbox contents are returned.
const installedChecks = `DO $apex$ BEGIN
  IF (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace
      AND relname=ANY(${sqlArray(tables)}) AND relkind='r' AND relrowsecurity AND NOT relforcerowsecurity
      AND relowner=current_user::regrole)<>8 THEN RAISE EXCEPTION 'Expected eight private owner-managed RLS tables'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
      WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY(${sqlArray(tables)}))
    THEN RAISE EXCEPTION 'Unexpected RLS policy'; END IF;
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname=ANY(${sqlArray(functions)}) AND pronargs=0 AND prorettype='trigger'::regtype
      AND proowner=current_user::regrole AND NOT prosecdef)<>4
    THEN RAISE EXCEPTION 'Expected four private guard functions'; END IF;
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY(${sqlArray(tables)})
      AND t.tgname=ANY(${sqlArray(triggers)}) AND NOT t.tgisinternal AND t.tgenabled='O')<>8
    THEN RAISE EXCEPTION 'Expected eight enabled immutable triggers'; END IF;
  IF (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
      WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY(${sqlArray(indexes)})
      AND i.indisvalid AND i.indisready)<>3 THEN RAISE EXCEPTION 'Expected three explicit indexes'; END IF;
END $apex$;`;

export async function buildMigrationPlan({read=readFile, database='neondb', role='neondb_owner'}={}) {
  // These parameters support isolated local tests; the CLI never accepts identity overrides.
  if(!/^[a-z][a-z0-9_]{0,62}$/.test(database)||!/^[a-z][a-z0-9_]{0,62}$/.test(role))
    throw new Error('Invalid database/role');
  const sources=[];
  for(const [file,digest] of migrations){
    const bytes=await read(new URL('../db/migrations/'+file,import.meta.url));
    // The measured Neon proof recorded CRLF hashes. Check exactly that text
    // after newline normalization so the same reviewed files work on Linux.
    const source=bytes.toString('utf8').replaceAll('\r\n','\n');
    if(createHash('sha256').update(source.replaceAll('\n','\r\n')).digest('hex')!==digest)
      throw new Error('Migration digest mismatch: '+file);
    sources.push('-- '+file+' validated CRLF SHA256 '+digest+'\n'+source);
  }
  const header = `-- PREPARED ONLY. Execution requires verified target and separate release scope.
-- Project holy-bar-96685960 / branch br-dry-lab-azyb3ewl / endpoint ep-bold-mud-azjqt3cx.
-- SQL database/role checks CANNOT prove Neon branch/endpoint or Worker DATABASE_URL identity.
-- psql only: use -X --no-password; verified direct host, sslmode=verify-full.
\\set ON_ERROR_STOP on
`;
  const preflight = `${identity(database,role)}
DO $apex$ BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext(current_database()),180181)
    THEN RAISE EXCEPTION 'Another Apex migration operator owns the database'; END IF;
  IF NOT has_schema_privilege(current_user,'public','CREATE') OR to_regclass('public.booking_requests') IS NULL
    THEN RAISE EXCEPTION 'Missing existing intake schema or CREATE privilege'; END IF;
  -- Reject every relation namespace generated by these tables, not just table names.
  IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND (
      relname=ANY(${sqlArray(indexes)}) OR EXISTS (SELECT 1 FROM unnest(${sqlArray(tables)}) n
        WHERE relname=n OR starts_with(relname,n||'_'))))
    OR EXISTS (SELECT 1 FROM pg_type WHERE typnamespace='public'::regnamespace
      AND (typname=ANY(${sqlArray(tables)}) OR typname=ANY(${sqlArray(tables.map(t=>'_'+t))})))
    OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(${sqlArray(functions)}))
    OR EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE c.relnamespace='public'::regnamespace AND t.tgname=ANY(${sqlArray(triggers)}))
    THEN RAISE EXCEPTION 'Migration object collision or partial installation; stop without retry'; END IF;
END $apex$;
CREATE TEMP TABLE apex_existing_relations ON COMMIT DROP AS ${publicClasses};
`;
  const beforeCommit = `${installedChecks}
DO $apex$ BEGIN
  IF EXISTS (SELECT * FROM pg_temp.apex_existing_relations EXCEPT ${publicClasses})
    THEN RAISE EXCEPTION 'Existing public relation identity changed'; END IF;
END $apex$;
`;
  const readback = `${header}BEGIN READ ONLY;
SET LOCAL statement_timeout='60s';
${identity(database,role)}
${installedChecks}
SELECT current_database() AS database,current_user AS role,clock_timestamp() AS verified_at;
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner
FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY(${sqlArray(tables)}) ORDER BY c.relname;
SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace
AND c.relname=ANY(${sqlArray(tables)}) AND NOT t.tgisinternal ORDER BY c.relname,t.tgname;
COMMIT;
`;
  return {apply: `${header}BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL idle_in_transaction_session_timeout='60s';
${preflight}
${sources.join('\n')}
${beforeCommit}
COMMIT;
\\echo 'COMMIT acknowledged. Run separate readback and production smoke; keep activation gates closed.'
`, readback};
}

async function main(){
  if(process.argv.length!==3)throw new Error('Usage: node scripts/prepare-production-migrations.mjs <new-output-directory>');
  const plan=await buildMigrationPlan();
  const directory=resolve(process.argv[2]);
  // An existing directory is refused, so no reviewed/prepared artifact is overwritten.
  await mkdir(directory,{recursive:false});
  await writeFile(resolve(directory,'apply.sql'),plan.apply,{flag:'wx'});
  await writeFile(resolve(directory,'readback.sql'),plan.readback,{flag:'wx'});
  console.log('PREPARED ONLY: apply.sql and readback.sql. No connection or SQL execution occurred.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  await main();
