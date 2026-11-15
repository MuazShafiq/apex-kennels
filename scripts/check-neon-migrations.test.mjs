import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNeonIdentity,validateSchemaCopyEvidence,validateTargetConnection,runNeonValidation} from './check-neon-migrations.mjs';

const expected={projectId:'synthetic-project',productionBranchId:'br-production',productionEndpointId:'ep-production',targetBranchId:'br-development'};
function fixture(){return {
  project:{id:expected.projectId},
  production:{id:expected.productionBranchId,project_id:expected.projectId},
  productionEndpoint:{id:expected.productionEndpointId,branch_id:expected.productionBranchId,project_id:expected.projectId,host:'ep-production.example.neon.tech'},
  target:{id:expected.targetBranchId,project_id:expected.projectId,parent_id:expected.productionBranchId,name:'apex-migration-validation-synthetic',init_source:'parent-schema',default:false,protected:false,current_state:'ready'},
  endpoints:[{id:'ep-development',project_id:expected.projectId,branch_id:expected.targetBranchId,type:'read_write',host:'ep-development.example.neon.tech'}],
};}
test('control-plane identity accepts only explicitly related schema-only development branch',()=>{
  assert.equal(validateNeonIdentity(fixture(),expected).id,'ep-development');
  const mutations=[
    f=>{f.project.id='another-project';},f=>{f.productionEndpoint.branch_id='br-other';},
    f=>{f.target.id='br-production';},f=>{f.target.project_id='other';},
    f=>{f.target.default=true;},f=>{delete f.target.default;},f=>{f.target.protected=true;},
    f=>{f.target.init_source='parent-data';},f=>{f.target.init_source='schema-only';delete f.target.parent_id;},
    f=>{f.target.parent_id='br-other';},f=>{f.target.last_reset_at='2026-01-01';},
    f=>{f.target.pending_state='ready';},f=>{f.target.name='production-copy';},
    f=>{f.endpoints[0].branch_id='br-production';},f=>{f.endpoints[0].host=f.productionEndpoint.host;},
    f=>{f.endpoints[0].host='ep-development.example.neon.tech.attacker.test';},f=>{f.endpoints.push({...f.endpoints[0]});},
  ];
  for(const mutate of mutations){const data=fixture();mutate(data);assert.throws(()=>validateNeonIdentity(data,expected));}
});
test('connection URI is fetched for and bound to the verified endpoint, database and role',()=>{
  const endpoint=fixture().endpoints[0];
  const uri='postgresql://synthetic_owner:synthetic_password@'+endpoint.host+'/neondb?sslmode=require&channel_binding=require';
  assert.equal(new URL(validateTargetConnection(uri,endpoint,'neondb','synthetic_owner')).search,'');
  for(const bad of [uri.replace(endpoint.host,fixture().productionEndpoint.host),uri+'&options=-csearch_path=evil',uri.replace('/neondb','/other'),uri.replace('synthetic_owner','other_owner'),uri.replace('postgresql:','http:'),uri+'#fragment'])
    assert.throws(()=>validateTargetConnection(bad,endpoint,'neondb','synthetic_owner'));
});
test('missing management authentication fails before networking or database work',async()=>{
  await assert.rejects(runNeonValidation({}),/NEON_API_KEY is required/);
  await assert.rejects(runNeonValidation({NEON_API_KEY:'synthetic-only'}),/NEON_PROJECT_ID/);
});

const operationExpected={...expected,schemaCopyOperationId:'synthetic-initial-copy'};
function omittedParentFixture(){
  const data=fixture();delete data.target.parent_id;
  const created=new Date(Date.now()-60000).toISOString();
  data.target.created_at=created;
  data.schemaCopyEvidence={operation:{id:operationExpected.schemaCopyOperationId,project_id:expected.projectId,branch_id:expected.targetBranchId,endpoint_id:data.endpoints[0].id,action:'apply_schema_from_branch',status:'finished',failures_count:0,created_at:created,updated_at:created},comparison:{diff:''}};
  return data;
}

test('omitted parent accepts initialization plus current schema equivalence, without claiming source lineage',()=>{
  const data=omittedParentFixture();
  assert.equal(validateNeonIdentity(data,operationExpected).id,'ep-development');
  assert.doesNotThrow(()=>validateSchemaCopyEvidence({target:data.target,endpoint:data.endpoints[0],...data.schemaCopyEvidence},operationExpected));
  assert.throws(()=>validateNeonIdentity(data,expected),/NEON_TEST_SCHEMA_COPY_OPERATION_ID/);
  delete data.schemaCopyEvidence;
  assert.throws(()=>validateNeonIdentity(data,operationExpected),/requires authenticated/);
});

test('parent fallback rejects explicit invalid parent and every other initialization source',()=>{
  for(const parent_id of [null,'',' ',undefined,'br-other']){
    const data=omittedParentFixture();data.target.parent_id=parent_id;
    assert.throws(()=>validateNeonIdentity(data,operationExpected),/parent identity/);
  }
  for(const source of ['parent-data','schema-only',null,undefined,'']){
    const data=omittedParentFixture();data.target.init_source=source;
    assert.throws(()=>validateNeonIdentity(data,operationExpected),/parent-schema/);
  }
});

test('extra evidence properties cannot replace the statically verified target or endpoint',()=>{
  const data=omittedParentFixture();
  data.schemaCopyEvidence.endpoint={...data.endpoints[0],id:'ep-other'};
  data.schemaCopyEvidence.operation.endpoint_id='ep-other';
  assert.throws(()=>validateNeonIdentity(data,operationExpected),/operation identity/);
  const alteredTarget=omittedParentFixture();
  alteredTarget.schemaCopyEvidence.target={...alteredTarget.target,created_at:new Date(Date.now()-60000).toISOString()};
  alteredTarget.target.created_at='invalid';
  assert.throws(()=>validateNeonIdentity(alteredTarget,operationExpected),/initialization/);
});

test('schema-copy evidence binds exact operation, target, project and endpoint and successful completion',()=>{
  const mutations=[
    d=>{delete d.schemaCopyEvidence.operation;},
    ...['id','project_id','branch_id','endpoint_id','action','status'].flatMap(key=>[
      d=>{d.schemaCopyEvidence.operation[key]='wrong';},d=>{delete d.schemaCopyEvidence.operation[key];},
    ]),
    ...[1,-1,'0',null,undefined].map(value=>d=>{d.schemaCopyEvidence.operation.failures_count=value;}),
    d=>{d.schemaCopyEvidence.operation.status='running';},
  ];
  for(const mutate of mutations){const data=omittedParentFixture();mutate(data);assert.throws(()=>validateNeonIdentity(data,operationExpected));}
});

test('schema-copy timestamps attribute the operation to initial creation with bounded delay',()=>{
  const data=omittedParentFixture();
  data.target.created_at=new Date(Date.now()-600000).toISOString();
  const start=Date.parse(data.target.created_at);
  for(const offset of [0,300000]){
    data.schemaCopyEvidence.operation.created_at=new Date(start+offset).toISOString();
    data.schemaCopyEvidence.operation.updated_at=new Date(start+offset).toISOString();
    assert.doesNotThrow(()=>validateNeonIdentity(data,operationExpected));
  }
  for(const offset of [-1,300001]){
    data.schemaCopyEvidence.operation.created_at=new Date(start+offset).toISOString();
    assert.throws(()=>validateNeonIdentity(data,operationExpected),/initialization/);
  }
  for(const key of ['branch-created','created_at','updated_at'])for(const value of [undefined,null,'',' ','invalid',0]){
    const invalid=omittedParentFixture();
    if(key==='branch-created')invalid.target.created_at=value;
    else invalid.schemaCopyEvidence.operation[key]=value;
    assert.throws(()=>validateNeonIdentity(invalid,operationExpected),/initialization/);
  }
  const backwards=omittedParentFixture();backwards.schemaCopyEvidence.operation.updated_at=new Date(Date.parse(backwards.target.created_at)-1).toISOString();
  assert.throws(()=>validateNeonIdentity(backwards,operationExpected),/initialization/);
  const future=omittedParentFixture();future.schemaCopyEvidence.operation.updated_at=new Date(Date.now()+60000).toISOString();
  assert.throws(()=>validateNeonIdentity(future,operationExpected),/initialization/);
});

test('schema comparison requires the exact empty diff string, never missing/blank/nonstring evidence',()=>{
  for(const comparison of [undefined,null,{}, {diff:null},{diff:undefined},{diff:false},{diff:[]},{diff:0},{diff:' '},{diff:'\n'},{diff:'CREATE TABLE unexpected();'}]){
    const data=omittedParentFixture();data.schemaCopyEvidence.comparison=comparison;
    assert.throws(()=>validateNeonIdentity(data,operationExpected),/exactly match/);
  }
});

const syntheticEnv={NEON_API_KEY:'synthetic-only-private-key',NEON_PROJECT_ID:expected.projectId,NEON_PRODUCTION_BRANCH_ID:expected.productionBranchId,NEON_PRODUCTION_ENDPOINT_ID:expected.productionEndpointId,NEON_TEST_BRANCH_ID:expected.targetBranchId,NEON_TEST_DATABASE:'neondb',NEON_TEST_ROLE:'synthetic_owner',NEON_TEST_SCHEMA_COPY_OPERATION_ID:operationExpected.schemaCopyOperationId};
const sqlBoundary=new Error('synthetic SQL connection boundary');
function runnerHarness(data=omittedParentFixture(),{failPath,failStatus=403,comparisonPayload,connectionUri}={}){
  const calls=[],logs=[],connections=[];
  const base='/api/v2/projects/'+expected.projectId;
  const operationPath=base+'/operations/'+operationExpected.schemaCopyOperationId;
  const comparisonPath=base+'/branches/'+expected.targetBranchId+'/compare_schema?base_branch_id='+expected.productionBranchId+'&db_name=neondb';
  const uriPath=base+'/connection_uri?branch_id='+expected.targetBranchId+'&endpoint_id=ep-development&database_name=neondb&role_name=synthetic_owner&pooled=false';
  const payloads=new Map([
    [base,{project:data.project}],
    [base+'/branches/'+expected.productionBranchId,{branch:data.production}],
    [base+'/endpoints/'+expected.productionEndpointId,{endpoint:data.productionEndpoint}],
    [base+'/branches/'+expected.targetBranchId,{branch:data.target}],
    [base+'/branches/'+expected.targetBranchId+'/endpoints',{endpoints:data.endpoints}],
    [operationPath,{operation:data.schemaCopyEvidence?.operation}],
    [comparisonPath,comparisonPayload??data.schemaCopyEvidence?.comparison],
    [uriPath,{uri:connectionUri??'postgresql://synthetic_owner:synthetic_password@ep-development.example.neon.tech/neondb?sslmode=require&channel_binding=require'}],
  ]);
  const fetcher=async(raw,options)=>{
    const url=new URL(raw);assert.equal(url.origin,'https://console.neon.tech');
    assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
    assert.equal(options.headers.Authorization,'Bearer '+syntheticEnv.NEON_API_KEY);
    assert.equal(options.headers.Accept,'application/json');assert(options.signal instanceof AbortSignal);
    const path=url.pathname+url.search;calls.push(path);
    assert(payloads.has(path),'Unexpected GET: '+path);
    return {ok:path!==failPath,status:path===failPath?failStatus:200,json:async()=>payloads.get(path)};
  };
  const dependencies={fetcher,log:message=>logs.push(message),clientFactory:uri=>{connections.push(uri);return {connect:async()=>{throw sqlBoundary;}};}};
  return {calls,logs,connections,dependencies,base,operationPath,comparisonPath,uriPath};
}

test('runner fetches exact operation then bound schema comparison then target URI before SQL',async()=>{
  const h=runnerHarness();
  await assert.rejects(runNeonValidation(syntheticEnv,h.dependencies),error=>error===sqlBoundary);
  assert.equal(h.calls.length,8);
  assert.deepEqual(h.calls.slice(5),[h.operationPath,h.comparisonPath,h.uriPath]);
  assert.equal(h.connections.length,1);
  assert.equal(new URL(h.connections[0]).search,'');
  assert(h.logs[0].includes('evidence=initial-schema-copy-and-current-schema-equivalence'));
  assert(!h.logs.join('').includes('synthetic_password'));assert(!h.logs.join('').includes(syntheticEnv.NEON_API_KEY));
});

test('linked-parent runner requires neither operation ID nor schema comparison',async()=>{
  const h=runnerHarness(fixture()),env={...syntheticEnv};delete env.NEON_TEST_SCHEMA_COPY_OPERATION_ID;
  await assert.rejects(runNeonValidation(env,h.dependencies),error=>error===sqlBoundary);
  assert.equal(h.calls.length,6);assert.equal(h.calls[5],h.uriPath);
  assert(h.logs[0].includes('evidence=linked-parent'));
});

test('runner rejects unsafe static identities before operation, schema comparison, URI or SQL',async()=>{
  const mutations=[
    d=>{d.project.id='other';},d=>{d.production.id='other';},d=>{d.productionEndpoint.id='other';},
    d=>{d.target.id=expected.productionBranchId;},d=>{d.target.project_id='other';},
    d=>{d.target.parent_id=null;},d=>{d.target.parent_id='br-other';},d=>{d.target.parent_id='';},
    d=>{d.target.init_source='parent-data';},d=>{d.target.init_source='schema-only';},
    d=>{d.target.default=true;},d=>{d.target.protected=true;},d=>{d.target.current_state='init';},
    d=>{d.target.last_reset_at='2026-01-01';},d=>{d.target.restored_from={};},
    d=>{d.endpoints[0].branch_id=expected.productionBranchId;},
    d=>{d.endpoints[0].host=d.productionEndpoint.host;},d=>{d.endpoints.push({...d.endpoints[0]});},
  ];
  for(const mutate of mutations){
    const data=omittedParentFixture();mutate(data);const h=runnerHarness(data);
    await assert.rejects(runNeonValidation(syntheticEnv,h.dependencies));
    assert.equal(h.calls.length,5);assert.equal(h.connections.length,0);
  }
  const h=runnerHarness();
  await assert.rejects(runNeonValidation({...syntheticEnv,NEON_TEST_BRANCH_ID:expected.productionBranchId},h.dependencies),/Refusing production/);
  assert.equal(h.calls.length,0);assert.equal(h.connections.length,0);
});

test('missing or invalid explicit operation ID fails before operation GET, schema comparison or SQL',async()=>{
  for(const id of [undefined,'',' ', '../other']){
    const h=runnerHarness();
    await assert.rejects(runNeonValidation({...syntheticEnv,NEON_TEST_SCHEMA_COPY_OPERATION_ID:id},h.dependencies),/NEON_TEST_SCHEMA_COPY_OPERATION_ID/);
    assert.equal(h.calls.length,5);assert.equal(h.connections.length,0);
  }
});

test('invalid operation is rejected before schema comparison, URI or SQL',async()=>{
  for(const mutate of [d=>{d.schemaCopyEvidence.operation.endpoint_id='other';},d=>{d.schemaCopyEvidence.operation.status='running';},d=>{d.schemaCopyEvidence.operation.failures_count=1;},d=>{delete d.schemaCopyEvidence.operation;},d=>{d.schemaCopyEvidence.operation.created_at='invalid';}]){
    const data=omittedParentFixture();mutate(data);const h=runnerHarness(data);
    await assert.rejects(runNeonValidation(syntheticEnv,h.dependencies));
    assert.equal(h.calls.length,6);assert.equal(h.connections.length,0);
  }
});

test('schema mismatch or malformed comparison rejects before URI retrieval and SQL',async()=>{
  for(const comparisonPayload of [{diff:'CREATE TABLE unexpected();'},{}, {diff:' '},{diff:null}]){
    const h=runnerHarness(undefined,{comparisonPayload});
    await assert.rejects(runNeonValidation(syntheticEnv,h.dependencies),/exactly match/);
    assert.equal(h.calls.length,7);assert.equal(h.connections.length,0);
  }
});

test('every control-plane HTTP failure fails closed without SQL or later requests',async()=>{
  const template=runnerHarness();
  const paths=[template.base,template.base+'/branches/'+expected.productionBranchId,template.base+'/endpoints/'+expected.productionEndpointId,template.base+'/branches/'+expected.targetBranchId,template.base+'/branches/'+expected.targetBranchId+'/endpoints',template.operationPath,template.comparisonPath,template.uriPath];
  for(const failPath of paths)for(const failStatus of [401,403,404,429,500]){
    const h=runnerHarness(undefined,{failPath,failStatus});
    await assert.rejects(runNeonValidation(syntheticEnv,h.dependencies),new RegExp('HTTP '+failStatus));
    assert.equal(h.connections.length,0);
    if(paths.indexOf(failPath)<5)assert.equal(h.calls.length,5);
    else assert.equal(h.calls.at(-1),failPath);
  }
});

test('verified evidence still rejects a production or overridden connection URI before SQL',async()=>{
  for(const connectionUri of ['postgresql://synthetic_owner:synthetic_password@ep-production.example.neon.tech/neondb','postgresql://synthetic_owner:synthetic_password@ep-development.example.neon.tech/neondb?options=unsafe']){
    const h=runnerHarness(undefined,{connectionUri});
    await assert.rejects(runNeonValidation(syntheticEnv,h.dependencies));
    assert.equal(h.calls.length,8);assert.equal(h.connections.length,0);
  }
});
