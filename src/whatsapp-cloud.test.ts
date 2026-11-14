import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePakistanWhatsappPhone,sendApprovedTemplate,WhatsappError,bookingAlertTemplateValues} from './whatsapp-cloud.ts';
import {handleWorkerRequest,type WorkerEnv} from './cloudflare-worker.ts';

const config={accessToken:'synthetic-access-token-that-is-very-long',
  phoneNumberId:'123456789012345',apiVersion:'v26.0'};
const to='0300 1234567';
const wamid='wamid.HBgMOTIzMDAwMDAwMDAwFQIAERg';

test('Pakistan E.164 normalization does not guess countries or corrupt numbers',()=>{
  for(const number of ['03001234567','+92 300 1234567','923001234567','00923001234567'])
    assert.equal(normalizePakistanWhatsappPhone(number),'923001234567');
  for(const number of ['abc','0300','+14155550123','9230012345678'])
    assert.throws(()=>normalizePakistanWhatsappPhone(number));
});
test('Meta Cloud API sends only an approved named template over HTTPS with server-side token',async()=>{
  let count=0;
  const send:typeof fetch=async(url,init)=>{
    count++;
    assert.equal(String(url),'https://graph.facebook.com/v26.0/123456789012345/messages');
    assert.equal(init?.method,'POST');
    assert.equal(init?.redirect,'manual');
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+config.accessToken);
    const body=JSON.parse(String(init?.body));
    assert.equal(body.messaging_product,'whatsapp');
    assert.equal(body.to,'923001234567');
    assert.equal(body.type,'template');
    assert.equal(body.template.name,'apex_new_booking');
    assert.deepEqual(body.template.components,[{type:'body',parameters:[{
      type:'text',text:'123E4567'
    }]}]);
    assert.doesNotMatch(JSON.stringify(body),/token|medication|vaccination/i);
    return new Response(JSON.stringify({messages:[{id:wamid}]}),{status:200});
  };
  const result=await sendApprovedTemplate(config,to,'apex_new_booking',
    bookingAlertTemplateValues('123e4567'),send);
  assert.deepEqual(result,{accepted:true,messageId:wamid});
  assert.equal(count,1);
});
test('invalid config and template never call Meta',async()=>{
  let count=0;
  const fake:typeof fetch=async()=>{count++;return new Response('');};
  await assert.rejects(()=>sendApprovedTemplate(config,to,'../bad',['test'],fake));
  await assert.rejects(()=>sendApprovedTemplate({...config,accessToken:''},to,'apex_alert',['test'],fake));
  await assert.rejects(()=>sendApprovedTemplate(config,'not a phone','apex_alert',['test'],fake));
  assert.equal(count,0);
});
test('provider rejection or invalid accepted message cannot be described as delivered',async()=>{
  await assert.rejects(()=>sendApprovedTemplate(config,to,'apex_alert',['123e4567'],
    async()=>new Response('rate limit',{status:429})),
    (e:unknown)=>e instanceof WhatsappError&&e.status===429);
  await assert.rejects(()=>sendApprovedTemplate(config,to,'apex_alert',['123e4567'],
    async()=>new Response('{}',{status:200})),WhatsappError);
});

const origin='https://example.workers.dev';
const intake={
  source:'google_form',externalResponseId:'wa-alert-synthetic-test-1',
  customerName:'Example Owner',phone:'03001234567',petName:'Demo pet',
  startDate:'2026-12-01',endDate:'2026-12-02'
};
const intakeEnv:WorkerEnv={
  DATABASE_URL:'postgres://invalid/synthetic',INTAKE_API_SECRET:'x'.repeat(48),
  WHATSAPP_ALERTS_ENABLED:'true',
  WHATSAPP_OWNER_CONSENT_AT:'2026-01-01T00:00:00Z',
  WHATSAPP_OWNER_CONSENT_EVIDENCE:'Synthetic test consent',
  WHATSAPP_ACCESS_TOKEN:config.accessToken,
  WHATSAPP_PHONE_NUMBER_ID:config.phoneNumberId,
  WHATSAPP_GRAPH_VERSION:'v26.0',
  WHATSAPP_OWNER_PHONE:to,
  WHATSAPP_OWNER_ALERT_TEMPLATE:'apex_new_booking'
};
const authorized=(payload:unknown)=>new Request(origin+'/api/ingest',{
  method:'POST',headers:{Authorization:'Bearer '+'x'.repeat(48),'Content-Type':'application/json'},
  body:JSON.stringify(payload)
});

test('a newly saved Google Form request queues one owner alert without blocking ingestion',async()=>{
  const calls:string[]=[];
  const pending:Promise<unknown>[]=[];
  const result=await handleWorkerRequest(authorized(intake),intakeEnv,
    async()=>({bookingId:'123e4567-e89b-42d3-a456-426614174001',created:true,status:'requested'}),{
      context:{waitUntil:(promise)=>{pending.push(promise);}},
      ownerAlerts:{dispatchOwnerAlert:async(_,id,config)=>{
        calls.push([config.recipient,config.template,id.slice(0,8).toUpperCase()].join('/'));
      }}
    });
  assert.equal(result.status,201);
  await Promise.all(pending);
  assert.deepEqual(calls,['0300 1234567/apex_new_booking/123E4567']);
});

test('replayed or canary submissions never notify; no config means no API call',async()=>{
  let sent=0;
  for(const scenario of [
    {input:intake,created:false,env:intakeEnv},
    {input:{...intake,customerName:'APEX CANARY synthetic'},created:true,env:intakeEnv},
    {input:intake,created:true,env:{...intakeEnv,WHATSAPP_ALERTS_ENABLED:'false'}}
  ]){
    const res=await handleWorkerRequest(authorized(scenario.input),scenario.env,
      async()=>({bookingId:'123e4567-e89b-42d3-a456-426614174001',
        created:scenario.created,status:'requested'}),{
        ownerAlerts:{dispatchOwnerAlert:async()=>{sent++;}}
      });
    assert.equal(res.status,scenario.created?201:200);
  }
  assert.equal(sent,0);
});
test('WhatsApp network failure cannot roll back an already persisted booking',async()=>{
  const response=await handleWorkerRequest(authorized(intake),intakeEnv,
    async()=>({bookingId:'123e4567-e89b-42d3-a456-426614174001',
      created:true,status:'requested'}),{
      ownerAlerts:{dispatchOwnerAlert:async()=>{throw new WhatsappError(503);}}
    });
  assert.equal(response.status,201);
});
