import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../integrations/google-form/Code.gs',import.meta.url),'utf8');
const fieldNames={
  startDate:'Boarding Period (start date)',
  endDate:'Boarding Period (end date)',
  customerName:"Owner's Name",
  ownerAddress:'Address\u00a0',
  pickupDropoffRequested:'Will you require pick-up and drop-off for your pet?',
  cameraCageRequested:'Camera Cage with 24/7 CCTV:',
  phone:'Phone number',
  emergencyContactPhone:'Emergency Contact number',
  petName:"Dog's Name\u00a0",
  breed:'Breed',
  gender:'Gender',
  age:'Age',
  vaccinationStatus:'Vaccination status',
  distemperHistory:'Has your pet ever been diagnosed with Canine Distemper?  ',
  veterinarianPhone:'Veterinarian contact number',
  specialInstructions:'Special Instructions\u00a0',
  medicationFeedingInstructions:'Medications and Feeding Instructions\u00a0'
} as const;
const traitRows=[
  'Friendly ', 'Fears (thunderstorms etc) ', 'Climber', 'Food Sensitivities ',
  'Barks Excessively', 'Allergies', 'Bite History ', 'Medical Conditions '
];
const answerValues:Record<string, unknown>={
  startDate:'2026-12-10',
  endDate:'2026-12-13',
  customerName:'Synthetic Owner',
  ownerAddress:'123 Example Street',
  pickupDropoffRequested:'No',
  cameraCageRequested:'Yes (Additional charges 500 per day apply)',
  phone:'03000000000',
  emergencyContactPhone:'03000000001',
  petName:'Synthetic Pet',
  breed:'Mixed breed',
  gender:'Male',
  age:'3 years',
  vaccinationStatus:'Fully vaccinated and booster is up to date',
  distemperHistory:'No',
  veterinarianPhone:'03000000002',
  specialInstructions:'Synthetic only',
  medicationFeedingInstructions:'Synthetic test diet',
  termsAccepted:['I have read and accept all the terms and conditions']
};
type Item = {
  getId():number;
  getTitle():string;
  getType():string;
  asGridItem?:()=>unknown;
  asCheckboxGridItem?:()=>unknown;
  asCheckboxItem?:()=>unknown;
};
function fixture(gridKind:'GRID'|'CHECKBOX_GRID', opts:{multiple?:boolean;badRow?:boolean;enabled?:boolean}={}) {
  const items:Item[]=[];
  const byId=new Map<string,Item>();
  for (const [key,title] of Object.entries(fieldNames)){
    const id=1000+items.length;
    const item={getId:()=>id,getTitle:()=>title,getType:()=> 'TEXT'};
    items.push(item); byId.set(String(id),item);
  }
  const gridRows=opts.badRow?[...traitRows.slice(0,7),'Unexpected trait']:traitRows;
  const gridMeta={getRows:()=>gridRows,getColumns:()=>['Yes','No']};
  const gridId=1000+items.length;
  const grid:Item={
    getId:()=>gridId,
    getTitle:()=>'(optional)',
    getType:()=>gridKind,
    asGridItem:()=>gridMeta,
    asCheckboxGridItem:()=>gridMeta
  };
  items.push(grid);byId.set(String(gridId),grid);
  const consentId=1000+items.length;
  const consent:Item={
    getId:()=>consentId,
    getTitle:()=> 'Terms and Conditions',
    getType:()=> 'CHECKBOX',
    asCheckboxItem:()=>({
      getChoices:()=>[{getValue:()=> 'I have read and accept all the terms and conditions'}]
    })
  };
  items.push(consent);byId.set(String(consentId),consent);
  const logs:string[]=[];
  const requests:Array<{url:string;payload:Record<string,unknown>}>=[];
  const triggers:Array<{getHandlerFunction:()=>string;getEventType:()=>string;getTriggerSource:()=>string;getTriggerSourceId:()=>string}>=[];
  const props:Record<string,string>={};
  if(opts.enabled) props.APEX_INTAKE_ENABLED='true';
  const form={
    getItems:()=>items,
    getId:()=> 'synthetic-form-id',
    getItemById:(id:number)=>byId.get(String(id)),
    getResponses:()=>{throw Error('Must not read customer responses')}
  };
  const context=vm.createContext({
    FormApp:{getActiveForm:()=>form,ItemType:{GRID:'GRID',CHECKBOX_GRID:'CHECKBOX_GRID',CHECKBOX:'CHECKBOX'}},
    Logger:{log:(value:string)=>logs.push(value)},
    Utilities:{
      formatDate:(d:Date,_timezone:string,_format:string)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),
      getUuid:()=> '00000000-0000-4000-8000-000000000001'
    },
    UrlFetchApp:{fetch:(url:string,options:{payload:string;headers:Record<string,string>})=>{
      const staging='https://apex-kennels-intake-staging.muaz-shafiq18.workers.dev/api/ingest';
      const production='https://apex-kennels-api.muaz-shafiq18.workers.dev/api/ingest';
      assert.ok(url===staging || url===production);
      assert.equal(options.headers.Authorization,'Bearer '+(url===staging ? props.APEX_STAGING_INTAKE_TOKEN : props.APEX_INTAKE_TOKEN));
      const payload=JSON.parse(options.payload) as Record<string,unknown>;
      requests.push({url,payload});
      const first=requests[0].payload;
      const isSame=JSON.stringify(first)===JSON.stringify(payload);
      const status=requests.length===1?201:isSame?200:409;
      return {
        getResponseCode:()=>status,
        getContentText:()=>JSON.stringify({bookingId:'fake-development-booking',created:status===201})
      };
    }},
    Session:{getScriptTimeZone:()=> 'Asia/Karachi'},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    ScriptApp:{
      EventType:{ON_FORM_SUBMIT:'ON_FORM_SUBMIT'},
      TriggerSource:{FORMS:'FORMS'},
      getProjectTriggers:()=>triggers,
      newTrigger:(handler:string)=>({
        forForm:(source:unknown)=>{
          assert.equal(source,form);
          return {onFormSubmit:()=>({create:()=>triggers.push({
            getHandlerFunction:()=>handler,
            getEventType:()=> 'ON_FORM_SUBMIT',
            getTriggerSource:()=> 'FORMS',
            getTriggerSourceId:()=> 'synthetic-form-id'
          })})};
        }
      })
    },
    PropertiesService:{getScriptProperties:()=>({
      getProperty:(name:string)=>props[name]??null,
      setProperties:(values:Record<string,string>)=>{Object.assign(props,values);},
      setProperty:(name:string,value:string)=>{props[name]=value;},
      deleteProperty:(name:string)=>{delete props[name];}
    })},
  });
  vm.runInContext(source,context,{filename:'Code.gs'});
  const propose=context.proposeApexFieldMap as ()=>void;
  const stage=context.stageApexFieldMapDisabled as ()=>void;
  const validate=context.validateApexSavedFieldMap as ()=>void;
  const testSynthetic=context.testApexSyntheticFormMapping as ()=>void;
  const preflight=context.apexPreflight as ()=>void;
  const testStaging=context.apexTestStagingDelivery as ()=>void;
  const armCanary=context.apexArmRealFormCanary as ()=>void;
  const activateShadow=context.apexActivateShadowIntake as ()=>void;
  const pauseShadow=context.apexPauseShadowIntake as ()=>void;
  const disarmCanary=context.apexDisarmRealFormCanary as ()=>void;
  const handleSubmit=context.onApexFormSubmit as (event:{response:unknown})=>void;
  const build=context.apexBuildPayload as (
    response:unknown,map:Record<string,string>)=>{details:{personalityTraits:Record<string,boolean>;termsAccepted:boolean};email:string};
  const values=new Map<string,unknown>();
  for(const [key,value] of Object.entries(answerValues)){
    if(key==='termsAccepted') values.set(String(consentId),value);
    else values.set(String(1000+Object.keys(fieldNames).indexOf(key)),value);
  }
  const choice=gridKind==='GRID'
    ? ['Yes','No','Yes','No','Yes','No','No','No']
    : [['Yes'],['No'],['Yes'],['No'],['Yes'],['No'],['No'],['No']];
  if(opts.multiple && gridKind==='CHECKBOX_GRID') choice[0]=['Yes','No'] as never;
  values.set(String(gridId),choice);
  let responseTimestamp=new Date('2026-12-10T12:00:00.000Z');
  const response={
    getTimestamp:()=> responseTimestamp,
    getId:()=> 'synthetic-form-response',
    getRespondentEmail:()=> 'synthetic@example.test',
    getItemResponses:()=>Array.from(values.entries()).map(([id,value])=>({
      getItem:()=>byId.get(id),
      getResponse:()=>value
    }))
  };
  const setResponseTimestamp=(date:string)=>{responseTimestamp=new Date(date);};
  const setField=(key:keyof typeof fieldNames,value:unknown)=>{
    values.set(String(1000+Object.keys(fieldNames).indexOf(key)),value);
  };
  return {propose,stage,validate,testSynthetic,preflight,testStaging,
    armCanary,disarmCanary,activateShadow,pauseShadow,handleSubmit,setField,setResponseTimestamp,build,response,logs,gridId,props,requests,triggers};
}

for(const kind of ['GRID','CHECKBOX_GRID'] as const) {
  test('Form item-ID discovery handles '+kind+' with real trailing spaces and NBSP',()=>{
    const f=fixture(kind);
    f.propose();
    assert.equal(f.logs.length,1);
    assert.match(f.logs[0],/APEX_FIELD_MAP PROPOSAL/);
    const map=JSON.parse(f.logs[0].slice(f.logs[0].indexOf('{'))) as Record<string,string>;
    assert.equal(map.personalityGrid,String(f.gridId));
    assert.equal(map.ownerAddress,'1003');
    assert.equal(map.termsAccepted,String(1000+Object.keys(fieldNames).length+1));
    const result=f.build(f.response,map);
    assert.equal(result.email,'synthetic@example.test');
    assert.equal(result.details.personalityTraits.friendly,true);
    assert.equal(result.details.personalityTraits.fears,false);
    assert.equal(result.details.personalityTraits.medicalConditions,false);
    assert.equal(result.details.termsAccepted,true);
  });
}

test('unrecognized grid row fails closed without reading existing answers',()=>{
  const f=fixture('GRID',{badRow:true});
  assert.throws(()=>f.propose(),/Personality trait grid not uniquely identified/);
});

test('checkbox grid cannot mark both Yes and No for the same safety trait',()=>{
  const f=fixture('CHECKBOX_GRID',{multiple:true});
  f.propose();
  const map=JSON.parse(f.logs[0].slice(f.logs[0].indexOf('{'))) as Record<string,string>;
  assert.throws(()=>f.build(f.response,map),/Multiple answers selected/);
});


test('metadata-only staging saves all mapped IDs and keeps intake disabled',()=>{
  const f=fixture('GRID');
  f.stage();
  assert.equal(f.props.APEX_INTAKE_ENABLED,'false');
  const map=JSON.parse(f.props.APEX_FIELD_MAP) as Record<string,string>;
  assert.equal(Object.keys(map).length,19);
  assert.equal(map.personalityGrid,String(f.gridId));
  assert.match(f.logs.at(-1)||'',/19 question IDs verified/);
  f.validate();
  assert.match(f.logs.at(-1)||'',/Intake disabled. No customer responses accessed/);
});

test('metadata staging refuses to change live intake',()=>{
  const f=fixture('GRID',{enabled:true});
  assert.throws(()=>f.stage(),/Cannot replace field map while live intake is enabled/);
  assert.equal(f.props.APEX_INTAKE_ENABLED,'true');
  assert.equal(f.props.APEX_FIELD_MAP,undefined);
});

test('metadata revalidation rejects tampered IDs and missing config while disabled',()=>{
  const f=fixture('GRID');
  assert.throws(()=>f.validate(),/Require disabled intake/);
  f.stage();
  const map=JSON.parse(f.props.APEX_FIELD_MAP) as Record<string,string>;
  map.petName='wrong-item-id';
  f.props.APEX_FIELD_MAP=JSON.stringify(map);
  assert.throws(()=>f.validate(),/Stored field map differs/);
});


for(const kind of ['GRID','CHECKBOX_GRID'] as const) {
  test('in-memory synthetic Form mapping checks full payload without real submissions ('+kind+')',()=>{
    const f=fixture(kind);
    f.stage();
    f.testSynthetic();
    assert.match(f.logs.at(-1)||'',/APEX SYNTHETIC FORM MAPPING PASSED/);
    assert.match(f.logs.at(-1)||'',/No responses read\/submitted, no HTTP request/);
    assert.equal(f.props.APEX_INTAKE_ENABLED,'false');
  });
}

test('in-memory synthetic Form validation fails if staging is missing',()=>{
  const f=fixture('GRID');
  assert.throws(()=>f.testSynthetic(),/Disable intake before testing/);
});


for(const kind of ['GRID','CHECKBOX_GRID'] as const) {
  test('single apexPreflight stages, validates, and dry-runs without reading responses ('+kind+')',()=>{
    const f=fixture(kind);
    f.preflight();
    assert.equal(f.props.APEX_INTAKE_ENABLED,'false');
    assert.equal(Object.keys(JSON.parse(f.props.APEX_FIELD_MAP)).length,19);
    assert.match(f.logs.at(-1)||'',/APEX PREFLIGHT PASS: 19 question IDs verified/);
    assert.match(f.logs.at(-1)||'',/No customer responses read or sent/);
    // Safe repeat even when a previous attempt was interrupted.
    f.preflight();
    assert.match(f.logs.at(-1)||'',/APEX PREFLIGHT PASS/);
  });
}

test('single apexPreflight refuses to run if intake is already enabled',()=>{
  const f=fixture('GRID',{enabled:true});
  assert.throws(()=>f.preflight(),/Cannot replace field map while live intake is enabled/);
  assert.equal(f.props.APEX_INTAKE_ENABLED,'true');
});


for(const kind of ['GRID','CHECKBOX_GRID'] as const) {
  test('staging delivery uses only in-memory synthetic Form data and a separate Worker ('+kind+')',()=>{
    const f=fixture(kind);
    f.props.APEX_STAGING_INTAKE_TOKEN='x'.repeat(64);
    f.stage();
    f.testStaging();
    assert.equal(f.requests.length,3);
    assert.equal(f.requests[0].payload.externalResponseId,'apex-form-staging-synthetic-00000000-0000-4000-8000-000000000001');
    assert.equal(f.requests[1].payload.externalResponseId,f.requests[0].payload.externalResponseId);
    assert.notDeepEqual(f.requests[2].payload.details,f.requests[0].payload.details);
    assert.match(f.logs.at(-1)||'',/APEX STAGING DELIVERY PASS: 201 new \/ 200 same \/ 409 changed/);
    assert.equal(f.props.APEX_INTAKE_ENABLED,'false');
  });
}
test('staging delivery fails closed with no staging token',()=>{
  const f=fixture('GRID');
  f.stage();
  assert.throws(()=>f.testStaging(),/Missing separate staging intake token/);
  assert.equal(f.requests.length,0);
});
test('staging delivery refuses a live-enabled Form integration',()=>{
  const f=fixture('GRID',{enabled:true});
  f.props.APEX_STAGING_INTAKE_TOKEN='x'.repeat(64);
  assert.throws(()=>f.testStaging(),/real Form intake is enabled/);
  assert.equal(f.requests.length,0);
});


for(const kind of ['GRID','CHECKBOX_GRID'] as const) {
  test('real Form canary installs exactly one disabled trigger, ignores customers, delivers once ('+kind+')',()=>{
    const f=fixture(kind);
    f.stage();
    f.props.APEX_API_URL='https://apex-kennels-api.muaz-shafiq18.workers.dev/api/ingest';
    f.props.APEX_INTAKE_TOKEN='p'.repeat(64);
    f.armCanary();
    assert.equal(f.triggers.length,1);
    assert.equal(f.props.APEX_INTAKE_ENABLED,'false');
    assert.match(f.props.APEX_CANARY_OWNER_NAME,/^APEX CANARY /);
    // The original synthetic respondent does not match the one-time marker.
    f.handleSubmit({response:f.response});
    assert.equal(f.requests.length,0);
    f.setField('customerName',f.props.APEX_CANARY_OWNER_NAME);
    f.setField('petName','APEX SYNTHETIC CANARY PET');
    f.handleSubmit({response:f.response});
    assert.equal(f.requests.length,1);
    assert.equal(f.requests[0].url,'https://apex-kennels-api.muaz-shafiq18.workers.dev/api/ingest');
    assert.equal(f.props.APEX_CANARY_COMPLETE,'true');
    f.handleSubmit({response:f.response});
    assert.equal(f.requests.length,1); // Can never insert a second canary
    f.disarmCanary();
    assert.equal(f.props.APEX_INTAKE_ENABLED,'false');
    assert.equal(f.props.APEX_CANARY_OWNER_NAME,undefined);
    assert.equal(f.triggers.length,1); // No destructive trigger changes
  });
}

test('canary arming fails closed without production credential and cannot enable live intake',()=>{
  const f=fixture('GRID');
  f.stage();
  assert.throws(()=>f.armCanary(),/Production Worker endpoint not explicitly configured/);
  assert.equal(f.triggers.length,0);
  assert.equal(f.requests.length,0);
  f.props.APEX_API_URL='https://apex-kennels-api.muaz-shafiq18.workers.dev/api/ingest';
  f.props.APEX_INTAKE_TOKEN='p'.repeat(64);
  f.armCanary();
  f.props.APEX_INTAKE_ENABLED='true';
  f.setField('customerName','Normal Person');
  assert.throws(()=>f.handleSubmit({response:f.response}),/Disarm test canary/);
  assert.equal(f.requests.length,0);
});

test('owner approval is required even if live enabled manually',()=>{
  const f=fixture('GRID',{enabled:true});
  f.handleSubmit && assert.throws(()=>f.handleSubmit({response:f.response}),/owner approval/);
  assert.equal(f.requests.length,0);
});


test('shadow activation refuses missing owner approval and does not change import boundary',()=>{
  const f=fixture('GRID');
  f.stage();
  f.props.APEX_API_URL='https://apex-kennels-api.muaz-shafiq18.workers.dev/api/ingest';
  f.props.APEX_INTAKE_TOKEN='p'.repeat(64);
  assert.throws(()=>f.activateShadow(),/Fatima must explicitly approve/);
  assert.equal(f.props.APEX_INTAKE_ENABLED,'false');
  assert.equal(f.props.APEX_LIVE_START_AFTER,undefined);
});

for(const kind of ['GRID','CHECKBOX_GRID'] as const) {
  test('shadow activation has cutoff, ignores pre-activation events and pauses ('+kind+')',()=>{
    const f=fixture(kind);
    f.stage();
    f.props.APEX_API_URL='https://apex-kennels-api.muaz-shafiq18.workers.dev/api/ingest';
    f.props.APEX_INTAKE_TOKEN='p'.repeat(64);
    f.armCanary();
    assert.throws(()=>f.activateShadow(),/Fatima must explicitly approve/);
    f.disarmCanary();
    f.props.APEX_OWNER_APPROVED_LIVE='true';
    f.activateShadow();
    assert.equal(f.props.APEX_INTAKE_ENABLED,'true');
    assert.match(f.props.APEX_LIVE_START_AFTER,/Z$/);
    assert.equal(f.props.APEX_LIVE_START_AFTER,f.props.APEX_RECONCILE_AFTER);
    assert.equal(f.triggers.length,1);
    f.setResponseTimestamp('2026-11-01T00:00:00Z');
    f.handleSubmit({response:f.response});
    assert.equal(f.requests.length,0);
    const cutoff=new Date(f.props.APEX_LIVE_START_AFTER);
    f.setResponseTimestamp(new Date(cutoff.getTime()+1000).toISOString());
    f.handleSubmit({response:f.response});
    assert.equal(f.requests.length,1);
    assert.equal(f.requests[0].url,'https://apex-kennels-api.muaz-shafiq18.workers.dev/api/ingest');
    assert.throws(()=>f.activateShadow(),/Shadow intake is not disabled/);
    f.pauseShadow();
    assert.equal(f.props.APEX_INTAKE_ENABLED,'false');
    f.handleSubmit({response:f.response});
    assert.equal(f.requests.length,1);
    assert.match(f.logs.at(-1)||'',/no new webhook deliveries/);
  });
}

test('shadow activation refuses missing or incorrect Form trigger',()=>{
  const f=fixture('GRID');
  f.stage();
  f.props.APEX_OWNER_APPROVED_LIVE='true';
  f.props.APEX_API_URL='https://apex-kennels-api.muaz-shafiq18.workers.dev/api/ingest';
  f.props.APEX_INTAKE_TOKEN='p'.repeat(64);
  assert.throws(()=>f.activateShadow(),/Exactly one correct Form submit trigger/);
  assert.equal(f.props.APEX_INTAKE_ENABLED,'false');
});
