import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const code=readFileSync(new URL('../integrations/google-form/Code.gs',import.meta.url),'utf8');
const activated='2026-11-04T20:30:37.411Z';
const cutoff=Date.parse(activated);
type Fixture={id:string;ms:number};
type FakeResponse={getId:()=>string;getTimestamp:()=>Date};

function harness(fixtures:Fixture[],live=true){
  const values=new Map<string,string>([
    ['APEX_INTAKE_ENABLED',String(live)],
    ['APEX_OWNER_APPROVED_LIVE','true'],
    ['APEX_API_URL','https://apex-kennels-api.muaz-shafiq18.workers.dev/api/ingest'],
    ['APEX_INTAKE_TOKEN','x'.repeat(48)],
    ['APEX_FIELD_MAP','{}'],
    ['APEX_LIVE_START_AFTER',activated],
    ['APEX_RECONCILE_AFTER',activated]
  ]);
  const properties={
    getProperty:(key:string)=>values.get(key)??null,
    setProperty:(key:string,value:string)=>{values.set(key,value);},
    deleteProperty:(key:string)=>{values.delete(key);},
    setProperties:(p:Record<string,string>)=>{
      for(const [key,value] of Object.entries(p))values.set(key,value);
    }
  };
  const delivered:string[]=[];
  const logs:string[]=[];
  const responses=fixtures.map((f):FakeResponse=>({
    getId:()=>f.id,
    getTimestamp:()=>new Date(f.ms)
  }));
  const triggers:{getHandlerFunction:()=>string;getEventType:()=>string;getTriggerSource:()=>string}[]=[];
  const sandbox:Record<string,unknown>={
    PropertiesService:{getScriptProperties:()=>properties},
    FormApp:{getActiveForm:()=>({
      getResponses:(after:Date)=>responses.filter(r=>r.getTimestamp().getTime()>after.getTime()).reverse()
    })},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    Logger:{log:(message:string)=>{logs.push(message);}},
    ScriptApp:{
      EventType:{CLOCK:'CLOCK'},
      TriggerSource:{CLOCK:'CLOCK'},
      getProjectTriggers:()=>triggers,
      newTrigger:(handler:string)=>({
        timeBased(){return this;},
        everyHours(hours:number){assert.equal(hours,1);return this;},
        create(){triggers.push({
          getHandlerFunction:()=>handler,
          getEventType:()=> 'CLOCK',
          getTriggerSource:()=> 'CLOCK'
        });}
      })
    }
  };
  runInNewContext(code,sandbox,{filename:'Code.gs'});
  let rejected:string|null=null;
  sandbox.apexSubmit=(response:FakeResponse)=>{
    if(response.getId()===rejected)throw new Error('Synthetic delivery failure');
    delivered.push(response.getId());
  };
  const call=(name:string)=>{const fn=sandbox[name] as (()=>void)|undefined;assert.ok(fn);fn();};
  return {
    call,delivered,logs,values,triggers,
    reject:(id:string|null)=>{rejected=id;}
  };
}

test('recovery never imports a pre-activation response, even when present in Form history',()=>{
  const h=harness([{id:'old',ms:cutoff-1},{id:'fresh',ms:cutoff+1000}]);
  h.call('reconcileApexRecentResponses');
  assert.deepEqual(h.delivered,['fresh']);
  h.call('reconcileApexRecentResponses');
  assert.deepEqual(h.delivered,['fresh']);
  assert.equal(JSON.parse(h.values.get('APEX_RECONCILE_CURSOR')??'{}').responseId,'fresh');
});

test('50-per-run recovery resumes at the exact cursor, including tied timestamps',()=>{
  const fixtures=Array.from({length:57},(_,i)=>({
    id:'response-'+String(i).padStart(3,'0'),ms:cutoff+2000
  }));
  const h=harness(fixtures);
  h.call('reconcileApexRecentResponses');
  assert.equal(h.delivered.length,50);
  assert.ok(h.logs.some(x=>x.includes('morePending=true')));
  h.call('reconcileApexRecentResponses');
  assert.equal(h.delivered.length,57);
  assert.equal(new Set(h.delivered).size,57);
  h.call('reconcileApexRecentResponses');
  assert.equal(h.delivered.length,57);
  assert.ok(h.logs.every(x=>!x.includes('response-')));
});

test('failed submission stops the run and is retried, without skipping later responses',()=>{
  const h=harness([1,2,3,4].map(i=>({id:'r'+i,ms:cutoff+i*1000})));
  h.reject('r3');
  assert.throws(()=>h.call('reconcileApexRecentResponses'),/Synthetic delivery failure/);
  assert.deepEqual(h.delivered,['r1','r2']);
  assert.equal(JSON.parse(h.values.get('APEX_RECONCILE_CURSOR')??'{}').responseId,'r2');
  h.reject(null);
  h.call('reconcileApexRecentResponses');
  assert.deepEqual(h.delivered,['r1','r2','r3','r4']);
});

test('recovery is fail-closed if its boundary is earlier than the live activation',()=>{
  const h=harness([{id:'old',ms:cutoff-1000}]);
  h.values.set('APEX_RECONCILE_AFTER',new Date(cutoff-3600000).toISOString());
  assert.throws(()=>h.call('reconcileApexRecentResponses'),/no earlier than the live activation/);
  assert.equal(h.delivered.length,0);
});

test('scheduled recovery is inert while paused; installation is explicit and idempotent',()=>{
  const h=harness([{id:'fresh',ms:cutoff+2000}],false);
  h.call('apexHourlyRecovery');
  assert.equal(h.delivered.length,0);
  assert.throws(()=>h.call('apexInstallHourlyRecovery'),/owner-approved shadow intake first/);
  h.values.set('APEX_INTAKE_ENABLED','true');
  h.call('apexInstallHourlyRecovery');
  h.call('apexInstallHourlyRecovery');
  assert.equal(h.triggers.length,1);
  assert.equal(h.triggers[0].getHandlerFunction(),'apexHourlyRecovery');
  h.call('apexHourlyRecovery');
  assert.deepEqual(h.delivered,['fresh']);
});
