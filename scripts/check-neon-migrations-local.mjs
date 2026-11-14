/** Loopback-only non-superuser rehearsal. Never reads a Neon/application URL. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {validateMigrationDatabase} from './check-neon-migrations.mjs';

const raw=process.env.NEON_VALIDATION_LOCAL_POSTGRES_URL;
if(!raw)throw new Error('Set NEON_VALIDATION_LOCAL_POSTGRES_URL to an explicit disposable loopback /postgres admin connection');
const url=new URL(raw);
assert(['postgres:','postgresql:'].includes(url.protocol)&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&url.pathname==='/postgres'&&!url.search&&!url.hash,'Only loopback /postgres without query overrides is accepted');
const suffix=Date.now()+'_'+randomUUID().replaceAll('-','').slice(0,8);
const database='apex_neon_rehearsal_'+suffix,role='apex_neon_owner_'+suffix;
const password=randomUUID()+randomUUID();
const admin=new Client({connectionString:raw});await admin.connect();
try{
  await admin.query("SET password_encryption='scram-sha-256'");
  await admin.query('CREATE ROLE '+role+" LOGIN CREATEDB CREATEROLE NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD '"+password+"'");
  await admin.query('CREATE DATABASE '+database+' OWNER '+role);
}finally{await admin.end();}
url.pathname='/'+database;url.username=role;url.password=password;
const dbUrl=url.toString(),clientFactory=connectionString=>new Client({connectionString});
const wrong=new URL(dbUrl);wrong.password=randomUUID();
const rejected=clientFactory(wrong.toString());
try{
  await assert.rejects(rejected.connect(),error=>error.code==='28P01','Rehearsal requires password authentication: reject trust/peer-only setup');
}finally{await rejected.end();}
console.log('PASS wrong password rejected; restricted owner uses SCRAM password authentication');
console.log('LOCAL non-superuser rehearsal: database='+database+' role='+role+' (synthetic and retained; no Neon branch)');
const db=clientFactory(dbUrl);await db.connect();
try{
  for(const file of ['db/schema.sql','db/migrations/001_full_form_details.sql','db/migrations/002_whatsapp_consent.sql','db/migrations/003_invoice_draft_reviews.sql','migrations/20261106_customer_transport_locations.sql','migrations/20261111_distinct_dropoff_location.sql'])
    await db.query(await readFile(new URL('../'+file,import.meta.url),'utf8'));
  await db.query('CREATE TABLE public.synthetic_force_rls_canary(id integer)');
  await db.query('INSERT INTO public.synthetic_force_rls_canary VALUES(1)');
  await db.query('ALTER TABLE public.synthetic_force_rls_canary ENABLE ROW LEVEL SECURITY');
  await db.query('ALTER TABLE public.synthetic_force_rls_canary FORCE ROW LEVEL SECURITY');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.synthetic_force_rls_canary')).rows[0].n,0);
  await assert.rejects(validateMigrationDatabase({dbUrl,clientFactory,log:()=>{}}),/row-level security/i);
  assert.equal((await db.query("SELECT to_regclass('public.approved_invoices') IS NULL AS absent")).rows[0].absent,true);
  await db.query('DROP TABLE public.synthetic_force_rls_canary');
  await db.query('CREATE TABLE public.approved_invoices(id integer)');
  await assert.rejects(validateMigrationDatabase({dbUrl,clientFactory,log:()=>{}}),/Partial migration inventory/);
  assert.equal((await db.query("SELECT to_regclass('public.invoice_approval_audit') IS NULL AS absent")).rows[0].absent,true);
  await db.query('DROP TABLE public.approved_invoices');
  console.log('PASS partial migration inventory rejected before any additive migration');
  await db.query('SELECT pg_advisory_lock(hashtext(current_database()),180181)');
  try{
    await assert.rejects(validateMigrationDatabase({dbUrl,clientFactory,log:()=>{}}),/Another migration validator/);
    assert.equal((await db.query("SELECT to_regclass('public.approved_invoices') IS NULL AS absent")).rows[0].absent,true);
  }finally{await db.query('SELECT pg_advisory_unlock(hashtext(current_database()),180181)');}
  console.log('PASS concurrent validator refuses before migration; session lock releases for subsequent run');
  console.log('PASS populated FORCE RLS table is rejected before migrations despite owner-visible zero rows');
}finally{await db.end();}
await validateMigrationDatabase({dbUrl,clientFactory});
// A second invocation must reject retained synthetic rows before any migration.
await assert.rejects(validateMigrationDatabase({dbUrl,clientFactory,log:()=>{}}),/contains existing data/);
console.log('PASS populated branch refusal; all database/provider evidence is LOCAL/fake');
