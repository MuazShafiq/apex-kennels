import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {buildMigrationPlan} from './prepare-production-migrations.mjs';

test('preparation pins migration content across checkout newline conventions',async()=>{
  const lf=await buildMigrationPlan({read:async url=>Buffer.from((await readFile(url,'utf8')).replaceAll('\r\n','\n'))});
  const crlf=await buildMigrationPlan({read:async url=>Buffer.from((await readFile(url,'utf8')).replaceAll('\r\n','\n').replaceAll('\n','\r\n'))});
  assert.deepEqual(lf,crlf);
  assert(lf.apply.indexOf('-- 004_')<lf.apply.indexOf('-- 005_'));
  assert(lf.apply.indexOf('-- 005_')<lf.apply.indexOf('-- 006_'));
  assert(lf.apply.startsWith('-- PREPARED ONLY.'));
  assert(lf.apply.includes('\\set ON_ERROR_STOP on'));
  assert(lf.readback.includes('BEGIN READ ONLY;'));
  assert(!lf.readback.includes('CREATE '));
  await assert.rejects(buildMigrationPlan({read:async url=>Buffer.from((await readFile(url,'utf8'))+'\n-- changed')}),/digest mismatch/);
});

test('CLI prepares files without overwriting an existing reviewed directory',async()=>{
  const root=await mkdtemp(join(tmpdir(),'apex-plan-'));
  try{
    const target=join(root,'prepared');
    const run=()=>spawnSync(process.execPath,['scripts/prepare-production-migrations.mjs',target],{encoding:'utf8'});
    const first=run();assert.equal(first.status,0,first.stderr);
    const before=await readFile(join(target,'apply.sql'),'utf8');
    assert.match(first.stdout,/No connection or SQL execution/);
    assert.notEqual(run().status,0);
    assert.equal(await readFile(join(target,'apply.sql'),'utf8'),before);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('populated loopback PostgreSQL: atomic apply, failures, collisions, locking and readback',
  {skip:!process.env.APEX_PLAN_LOCAL_POSTGRES_URL},async()=>{
  const raw=process.env.APEX_PLAN_LOCAL_POSTGRES_URL;
  const adminUrl=new URL(raw);
  assert(['postgres:','postgresql:'].includes(adminUrl.protocol)&&['127.0.0.1','localhost','[::1]'].includes(adminUrl.hostname)
    &&adminUrl.pathname==='/postgres'&&!adminUrl.search&&!adminUrl.hash,'Only explicit disposable loopback /postgres is accepted');
  const {Client}=await import('pg');
  const suffix=Date.now()+'_'+randomUUID().replaceAll('-','').slice(0,6);
  const database='apex_plan_'+suffix,role='apex_plan_owner_'+suffix,password=randomUUID();
  const admin=new Client({connectionString:raw});await admin.connect();
  try{
    await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`);
    await admin.query(`CREATE DATABASE ${database} OWNER ${role}`);
  }finally{await admin.end();}
  const target=new URL(raw);target.pathname='/'+database;target.username=role;target.password=password;
  const db=new Client({connectionString:target.toString()});await db.connect();
  const directory=await mkdtemp(join(tmpdir(),'apex-plan-pg-'));
  const catalog=async()=> (await db.query("SELECT 'relation' kind,oid::text,relname name FROM pg_class WHERE relnamespace='public'::regnamespace UNION ALL SELECT 'function',oid::text,proname FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY kind,oid,name")).rows;
  const psql=async(sql)=>{
    const file=join(directory,'run.sql');await writeFile(file,sql);
    return spawnSync('psql',['-X','--no-password','--file',file],{encoding:'utf8',timeout:90000,env:{...process.env,
      PGHOST:target.hostname,PGPORT:target.port||'5432',PGDATABASE:database,PGUSER:role,PGPASSWORD:password,
      PGSSLMODE:'disable',PGOPTIONS:''}});
  };
  try{
    for(const file of ['db/schema.sql','db/migrations/001_full_form_details.sql','db/migrations/002_whatsapp_consent.sql',
      'db/migrations/003_invoice_draft_reviews.sql','migrations/20261106_customer_transport_locations.sql','migrations/20261111_distinct_dropoff_location.sql'])
      await db.query(await readFile(new URL('../'+file,import.meta.url),'utf8'));
    const customer=(await db.query("INSERT INTO public.customers(full_name,phone) VALUES ('SYNTHETIC migration canary','synthetic-not-a-number') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO public.booking_requests(customer_id,source,external_submission_id,start_date,end_date) VALUES ($1,'google_form','SYNTHETIC migration canary','2026-11-01','2026-11-02')",[customer]);
    const before=await catalog();
    const plan=await buildMigrationPlan({database,role});
    const refused=async(sql,pattern)=>{
      const result=await psql(sql);assert.notEqual(result.status,0,'must fail closed');
      assert.match(result.stderr,pattern);assert.deepEqual(await catalog(),before);
      assert.equal((await db.query('SELECT count(*)::int n FROM public.booking_requests')).rows[0].n,1);
    };
    await refused((await buildMigrationPlan()).apply,/Unexpected database or role/);
    await refused(plan.apply.replace('-- 005_invoice_delivery.sql',"SELECT 1/0;\n-- 005_invoice_delivery.sql"),/division by zero/);
    await refused(plan.apply.replace('\nCOMMIT;',"\nDO $$ BEGIN RAISE EXCEPTION 'late canary'; END $$;\nCOMMIT;"),/late canary/);
    for(const setup of ['CREATE TABLE public.approved_invoices(id integer)',
      'CREATE SEQUENCE public.invoice_delivery_audit_id_seq',
      'CREATE FUNCTION public.guard_invoice_audit() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$']){
      await db.query('BEGIN');await db.query(setup);await db.query('COMMIT');
      const collision=await psql(plan.apply);assert.notEqual(collision.status,0);assert.match(collision.stderr,/object collision/);
      if(setup.startsWith('CREATE TABLE'))await db.query('DROP TABLE public.approved_invoices');
      else if(setup.startsWith('CREATE SEQUENCE'))await db.query('DROP SEQUENCE public.invoice_delivery_audit_id_seq');
      else await db.query('DROP FUNCTION public.guard_invoice_audit()');
      assert.deepEqual(await catalog(),before);
    }
    await db.query('SELECT pg_advisory_lock(hashtext(current_database()),180181)');
    try{await refused(plan.apply,/Another Apex migration operator/);}
    finally{await db.query('SELECT pg_advisory_unlock(hashtext(current_database()),180181)');}
    await db.query('BEGIN');await db.query('LOCK public.booking_requests IN ACCESS EXCLUSIVE MODE');
    try{await refused(plan.apply,/lock timeout/);}
    finally{await db.query('ROLLBACK');}
    const success=await psql(plan.apply);assert.equal(success.status,0,success.stderr);
    assert.match(success.stdout,/COMMIT acknowledged/);
    assert.equal((await db.query('SELECT count(*)::int n FROM public.booking_requests')).rows[0].n,1);
    const readback=await psql(plan.readback);assert.equal(readback.status,0,readback.stderr);
    // Exercise readback/replay refusal after commit; this does not simulate
    // network loss of a COMMIT acknowledgement.
    const replay=await psql(plan.apply);assert.notEqual(replay.status,0);assert.match(replay.stderr,/object collision/);
    await db.query('ALTER TABLE public.owner_alert_events DISABLE ROW LEVEL SECURITY');
    const broken=await psql(plan.readback);assert.notEqual(broken.status,0);assert.match(broken.stderr,/eight private/);
    assert.equal((await db.query("SELECT to_regclass('public.approved_invoices') IS NOT NULL present")).rows[0].present,true);
    await db.query('ALTER TABLE public.owner_alert_events ENABLE ROW LEVEL SECURITY');
    console.log('LOCAL populated migration-plan proof: '+database+'; no Neon branch/provider; synthetic database retained');
  }finally{await db.end();await rm(directory,{recursive:true,force:true});}
});
