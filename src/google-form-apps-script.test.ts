import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const source=readFileSync('integrations/google-form/Code.gs','utf8');
const fieldMap={customerName:'1',phone:'2',petName:'3',startDate:'4',endDate:'5'};
const response=(id:string,at='2026-11-10T00:00:00.000Z')=>({
  getId:()=>id,
  getTimestamp:()=>new Date(at),
  getRespondentEmail:()=>null,
  getItemResponses:()=>[
    [1,'Synthetic Owner'],[2,'03000000000'],[3,'Synthetic Dog'],[4,'2026-12-01'],[5,'2026-12-05']
  ].map(([itemId,value])=>({
    getItem:()=>({getId:()=>itemId}),
    getResponse:()=>value
  }))
});
type TestContext = {
  onApexFormSubmit:(e:{response:ReturnType<typeof response>})=>void;
  reconcileApexRecentResponses:()=>void;
  validateApexSyntheticResponseMapping:()=>void;
};
function runner(values:Record<string,string>,responses:ReturnType<typeof response>[]=[]){
  const submitted:{url:string;body:any}[]=[];
  const logs:string[]=[];
  let released=false;
  const props={getProperty:(key:string)=>values[key]||null};
  const context=createContext({
    PropertiesService:{getScriptProperties:()=>props},
    FormApp:{getActiveForm:()=>({
      getResponses:()=>responses,
      getResponse:(id:string)=>responses.find(r=>r.getId()===id),
      getItems:()=>[]
    })},
    UrlFetchApp:{fetch:(url:string,opts:{payload:string})=>{
      submitted.push({url,body:JSON.parse(opts.payload)});
      return {getResponseCode:()=>submitted.length%2===1?201:200};
    }},
    Logger:{log:(message:string)=>logs.push(message)},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{released=true;}})},
    Utilities:{formatDate:()=>''},
    Session:{getScriptTimeZone:()=> 'Asia/Karachi'}
  });
  runInContext(source,context);
  return {script:context as unknown as TestContext,submitted,logs,lockReleased:()=>released};
}
const enabled={
  APEX_INTAKE_ENABLED:'true',
  APEX_API_URL:'https://apex-kennels-api.muaz-shafiq18.workers.dev/api/ingest',
  APEX_INTAKE_TOKEN:'synthetic-test-token-not-real-'+'x'.repeat(44),
  APEX_OWNER_APPROVED_LIVE:'true',
  APEX_FIELD_MAP:JSON.stringify(fieldMap)
};

test('form trigger is safely disabled by default',()=>{
  const x=runner({...enabled,APEX_INTAKE_ENABLED:'false'});
  x.script.onApexFormSubmit({response:response('synthetic-001')});
  assert.equal(x.submitted.length,0);
});

test('enabled form submission maps stable IDs and keeps auth out of payload',()=>{
  const x=runner(enabled);
  x.script.onApexFormSubmit({response:response('synthetic-001')});
  assert.equal(x.submitted.length,1);
  assert.equal(x.submitted[0].body.externalResponseId,'synthetic-001');
  assert.equal(x.submitted[0].body.customerName,'Synthetic Owner');
  assert.equal(x.submitted[0].body.startDate,'2026-12-01');
  assert.equal(x.submitted[0].body.token,undefined);
});

test('manual reconciliation refuses to run without approved timestamp',()=>{
  const x=runner(enabled,[response('synthetic-001')]);
  assert.throws(()=>x.script.reconcileApexRecentResponses(),/APEX_RECONCILE_AFTER/);
  assert.equal(x.submitted.length,0);
});

test('manual reconciliation retries only responses after approved timestamp',()=>{
  const x=runner({...enabled,APEX_RECONCILE_AFTER:'2026-11-10T00:00:00Z'},[
    response('older','2026-11-09T23:59:00Z'),
    response('new-a','2026-11-10T00:01:00Z'),
    response('new-b','2026-11-10T00:02:00Z')
  ]);
  x.script.reconcileApexRecentResponses();
  assert.deepEqual(x.submitted.map(r=>r.body.externalResponseId),['new-a','new-b']);
  assert.equal(x.lockReleased(),true);
  assert.equal(x.logs.length,1);
  assert.doesNotMatch(x.logs[0],/Synthetic Owner|Synthetic Dog|030000/);
});

test('more than 50 responses requires manual review before replay',()=>{
  const x=runner({...enabled,APEX_RECONCILE_AFTER:'2026-11-01T00:00:00Z'},
    Array.from({length:51},(_,i)=>response('test-'+i)));
  assert.throws(()=>x.script.reconcileApexRecentResponses(),/More than 50/);
  assert.equal(x.submitted.length,0);
  assert.equal(x.lockReleased(),true);
});

test('synthetic mapping audit logs only presence booleans',()=>{
  const x=runner({...enabled,APEX_TEST_RESPONSE_ID:'synthetic-001'},[response('synthetic-001')]);
  x.script.validateApexSyntheticResponseMapping();
  assert.equal(x.submitted.length,0);
  assert.match(x.logs.join(''),/"provided":true/);
  assert.doesNotMatch(x.logs.join(''),/Synthetic Owner|Synthetic Dog|030000/);
});
