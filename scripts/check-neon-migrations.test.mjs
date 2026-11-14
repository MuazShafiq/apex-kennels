import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNeonIdentity,validateTargetConnection,runNeonValidation} from './check-neon-migrations.mjs';

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
