/** Explicit development-only Neon proof. No production SQL connection, branch
 * creation, credential rotation, environment-file loading or provider traffic.
 * Requires a pre-created parent-schema branch with an independently identified
 * production parent. All control-plane requests are GET; only the target's SQL
 * endpoint is used. See docs/neon-migration-validation.md before running.
 */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

class ValidationError extends Error {}
const requireSafe=(condition,message)=>{if(!condition)throw new ValidationError(message);};
const identifier=(value,name)=>{
  requireSafe(typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value),'Missing or invalid '+name);
  return value;
};
const sqlName=value=>'"'+value.replaceAll('"','""')+'"';
export const migrationGroups=[
  {file:'db/migrations/004_invoice_approval.sql',tables:['approved_invoices','invoice_approval_audit']},
  {file:'db/migrations/005_invoice_delivery.sql',tables:['invoice_delivery_outbox','invoice_delivery_audit','invoice_delivery_events']},
  {file:'db/migrations/006_owner_booking_alerts.sql',tables:['owner_alert_outbox','owner_alert_audit','owner_alert_events']},
];

export function validateNeonIdentity({project,production,productionEndpoint,target,endpoints},expected){
  requireSafe(project.id===expected.projectId,'Project identity mismatch');
  requireSafe(production.id===expected.productionBranchId&&production.project_id===project.id,'Production branch identity mismatch');
  requireSafe(productionEndpoint.id===expected.productionEndpointId&&productionEndpoint.branch_id===production.id&&productionEndpoint.project_id===project.id,'Production endpoint identity mismatch');
  requireSafe(target.id===expected.targetBranchId&&target.project_id===project.id&&target.id!==production.id,'Target branch identity mismatch');
  requireSafe(target.default===false&&target.protected===false,'Target must explicitly be non-default and unprotected');
  // parent-schema retains the source relationship. Legacy schema-only root
  // branches omit that relationship and cannot establish the required parent.
  requireSafe(target.init_source==='parent-schema'&&target.parent_id===production.id,'Target must be a parent-schema child of the identified production branch');
  requireSafe(/^apex-migration-validation-[a-zA-Z0-9_-]+$/.test(target.name),'Unexpected target branch name');
  requireSafe(target.current_state==='ready'&&!target.pending_state&&!target.last_reset_at&&!target.restored_from,'Target must be ready and never reset/restored');
  requireSafe(Array.isArray(endpoints)&&endpoints.length===1,'Target must have exactly one endpoint');
  const endpoint=endpoints[0];
  requireSafe(endpoint.project_id===project.id&&endpoint.branch_id===target.id&&endpoint.type==='read_write'&&endpoint.id!==productionEndpoint.id,'Target endpoint identity mismatch');
  requireSafe(typeof endpoint.host==='string'&&/^[a-z0-9.-]+\.neon\.tech$/.test(endpoint.host)&&endpoint.host!==productionEndpoint.host,'Invalid or production target host');
  return endpoint;
}

export function validateTargetConnection(raw,endpoint,database,role){
  let url;try{url=new URL(raw);}catch{throw new ValidationError('Invalid target connection URI');}
  requireSafe(['postgres:','postgresql:'].includes(url.protocol)&&url.hostname===endpoint.host&&(!url.port||url.port==='5432')&&!url.hash,'Target connection does not match verified endpoint');
  requireSafe(decodeURIComponent(url.pathname.slice(1))===database&&decodeURIComponent(url.username)===role&&url.password.length>0,'Target database/role mismatch');
  requireSafe([...url.searchParams.keys()].every(key=>['sslmode','channel_binding'].includes(key)),'Unexpected connection URI override');
  // TLS verification is set on Client explicitly, without connection-string
  // sslmode overriding it. No caller-supplied URL is accepted by this runner.
  url.search='';return url.toString();
}

const catalog=async db=>(await db.query("SELECT 'relation' AS kind,c.oid::text,c.relname AS name FROM pg_class c WHERE c.relnamespace='public'::regnamespace UNION ALL SELECT 'function',p.oid::text,p.proname FROM pg_proc p WHERE p.pronamespace='public'::regnamespace ORDER BY kind,oid,name")).rows;

export async function validateMigrationDatabase({dbUrl,clientFactory,log=console.log}){
  const guard=clientFactory(dbUrl);await guard.connect();
  try{
    const {locked}=(await guard.query('SELECT pg_try_advisory_lock(hashtext(current_database()),180181) AS locked')).rows[0];
    requireSafe(locked,'Another migration validator owns this database; use one operator per branch');
    await validateMigrationDatabaseUnlocked({dbUrl,clientFactory,log});
  }finally{await guard.end();}
}

async function validateMigrationDatabaseUnlocked({dbUrl,clientFactory,log}){
  const db=clientFactory(dbUrl);await db.connect();
  let database;
  try{
    const identity=(await db.query('SELECT current_database() AS database,current_user AS role,rolsuper,pg_get_userbyid(datdba)=current_user AS database_owner FROM pg_roles JOIN pg_database ON datname=current_database() WHERE rolname=current_user')).rows[0];
    requireSafe(identity&&!identity.rolsuper&&identity.database_owner,'Validation requires the non-superuser development database owner');
    database=identity.database;
    // FORCE RLS can hide rows even from a non-superuser table owner. PostgreSQL
    // must raise instead of silently filtering any emptiness check.
    await db.query('SET row_security=off');
    const tables=(await db.query("SELECT n.nspname,c.relname,c.relkind,c.relowner=current_user::regrole AS owned FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','f','m') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\' ORDER BY 1,2")).rows;
    requireSafe(tables.length>0,'Target has no copied schema');
    for(const table of tables){
      requireSafe(table.relkind!=='f','Foreign tables are not allowed in the validation branch');
      requireSafe(table.owned,'Validation role does not own every user table; emptiness cannot be established');
      const populated=await db.query('SELECT 1 FROM '+sqlName(table.nspname)+'.'+sqlName(table.relname)+' LIMIT 1');
      requireSafe(populated.rows.length===0,'Target contains existing data; use a fresh schema-only branch');
    }
    log('PASS identified non-superuser database owner; all user tables are empty');
    const pending=[];
    for(const group of migrationGroups){
      const present=group.tables.filter(name=>tables.some(t=>t.nspname==='public'&&t.relname===name));
      requireSafe(present.length===0||present.length===group.tables.length,'Partial migration inventory: '+group.file);
      if(!present.length)pending.push({...group,sql:await readFile(new URL('../'+group.file,import.meta.url),'utf8')});
    }
    const before=await catalog(db);
    await db.query('BEGIN');
    try{
      for(const group of pending)await db.query(group.sql);
      for(const group of migrationGroups)for(const table of group.tables)assert((await db.query('SELECT to_regclass($1) IS NOT NULL AS present',['public.'+table])).rows[0].present);
    }finally{await db.query('ROLLBACK');}
    assert.deepEqual(await catalog(db),before);
    log('PASS migration transaction rollback preserves original relation/function inventory');
    await db.query('BEGIN');
    try{
      for(const group of pending)await db.query(group.sql);
      await db.query('COMMIT');
    }catch(error){await db.query('ROLLBACK');throw error;}
    for(const group of pending)log('PASS applied '+group.file+' sha256='+createHash('sha256').update(group.sql).digest('hex'));
    const securedTables=migrationGroups.flatMap(group=>group.tables);
    const security=(await db.query("SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[])",[securedTables])).rows;
    assert.equal(security.length,securedTables.length);assert(security.every(row=>row.relrowsecurity));
    assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[])",[securedTables])).rows[0].n,0);
    log('PASS all eight migrated tables enable RLS without policies');
  }finally{await db.end();}
  const {runInvoiceDbChecks}=await import('./check-invoice-db.mjs');
  const {runOwnerAlertDbChecks}=await import('./check-owner-alert-db.mjs');
  await runInvoiceDbChecks({dbUrl,database,applySchema:false,clientFactory});
  await runOwnerAlertDbChecks({dbUrl,database,applySchema:false,clientFactory});
  const probe=clientFactory(dbUrl);await probe.connect();
  try{
    await probe.query('BEGIN');
    const role='apex_untrusted_'+randomUUID().replaceAll('-','').slice(0,8);
    await probe.query('CREATE ROLE '+role+' NOLOGIN');
    await probe.query('GRANT '+role+' TO CURRENT_USER');
    await probe.query('GRANT USAGE ON SCHEMA public TO '+role);
    const securedTables=migrationGroups.flatMap(group=>group.tables);
    await probe.query('GRANT SELECT,INSERT,UPDATE,DELETE ON '+securedTables.map(t=>'public.'+t).join(',')+' TO '+role);
    await probe.query('SET LOCAL ROLE '+role);
    for(const table of securedTables)assert.equal((await probe.query('SELECT count(*)::int AS n FROM public.'+table)).rows[0].n,0);
    await assert.rejects(probe.query("INSERT INTO public.owner_alert_events(provider_message_id,recipient,state,provider_timestamp) VALUES('wamid.synthetic_rls_probe','923000000000','delivered',1)"),/row-level security/i);
    log('PASS untrusted role cannot read any migrated row or insert status evidence despite table grants');
  }finally{await probe.query('ROLLBACK');await probe.end();}
}

export async function runNeonValidation(env=process.env){
  requireSafe(env.NEON_API_KEY,'NEON_API_KEY is required; authenticate Neon management access privately');
  const expected={projectId:identifier(env.NEON_PROJECT_ID,'NEON_PROJECT_ID'),productionBranchId:identifier(env.NEON_PRODUCTION_BRANCH_ID,'NEON_PRODUCTION_BRANCH_ID'),productionEndpointId:identifier(env.NEON_PRODUCTION_ENDPOINT_ID,'NEON_PRODUCTION_ENDPOINT_ID'),targetBranchId:identifier(env.NEON_TEST_BRANCH_ID,'NEON_TEST_BRANCH_ID')};
  requireSafe(expected.targetBranchId!==expected.productionBranchId,'Refusing production branch');
  const database=identifier(env.NEON_TEST_DATABASE,'NEON_TEST_DATABASE'),role=identifier(env.NEON_TEST_ROLE,'NEON_TEST_ROLE');
  const get=async path=>{
    const response=await fetch('https://console.neon.tech/api/v2'+path,{method:'GET',headers:{Authorization:'Bearer '+env.NEON_API_KEY,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});
    requireSafe(response.ok,'Neon control-plane GET failed: HTTP '+response.status);
    return response.json();
  };
  const base='/projects/'+expected.projectId;
  const [{project},{branch:production},{endpoint:productionEndpoint},{branch:target},{endpoints}]=await Promise.all([
    get(base),get(base+'/branches/'+expected.productionBranchId),get(base+'/endpoints/'+expected.productionEndpointId),get(base+'/branches/'+expected.targetBranchId),get(base+'/branches/'+expected.targetBranchId+'/endpoints'),
  ]);
  const endpoint=validateNeonIdentity({project,production,productionEndpoint,target,endpoints},expected);
  const query=new URLSearchParams({branch_id:target.id,endpoint_id:endpoint.id,database_name:database,role_name:role,pooled:'false'});
  const {uri}=await get(base+'/connection_uri?'+query);
  const dbUrl=validateTargetConnection(uri,endpoint,database,role);
  console.log('Neon development proof: project='+project.id+' production='+production.id+' target='+target.id+' endpoint='+endpoint.id+' init_source='+target.init_source);
  const {Client}=await import('pg');
  const clientFactory=connectionString=>new Client({connectionString,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:15000,query_timeout:30000,application_name:'apex-neon-migration-validation'});
  await validateMigrationDatabase({dbUrl,clientFactory});
  console.log('PASS Neon schema compatibility, rollback, concurrency, replay, atomicity and RLS; all providers fake; target='+target.id);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await runNeonValidation();}catch(error){
    // Never print provider/control-plane bodies, URLs, SQL values or stack traces.
    console.error('FAIL '+(error instanceof ValidationError?error.message:'validation failed; error code='+(/^[A-Z0-9_]+$/.test(error?.code??'')?error.code:'unclassified')+' (no credentials or database values logged)'));
    process.exitCode=1;
  }
}
