import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handleWorkerRequest,type WorkerEnv,type StaffOptions} from './cloudflare-worker.ts';
import {applyInvoiceWebhook,type DeliveryDb} from './invoice-delivery-store.ts';
import {applyOwnerAlertWebhook} from './owner-alert-store.ts';
import type {DeliveryWebhookEvent} from './invoice-delivery.ts';

const origin='https://example.test',path='/api/whatsapp/webhook';
const env:WorkerEnv={DATABASE_URL:'synthetic://no-database',WHATSAPP_PHONE_NUMBER_ID:'123456789012',WHATSAPP_WEBHOOK_SECRET:'synthetic-shared-app-secret',WHATSAPP_WEBHOOK_VERIFY_TOKEN:'synthetic-subscription-token'};
const invoiceId='wamid.synthetic_invoice_id',ownerId='wamid.synthetic_owner_id';
const status=(id:string,state='delivered')=>({id,status:state,recipient_id:'923000000000',timestamp:'1794700000'});
const payload=(sender=env.WHATSAPP_PHONE_NUMBER_ID,statuses=[status(invoiceId),status(ownerId)])=>JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:sender},statuses,messages:[{text:{body:'SYNTHETIC private care payload must be discarded'}}]}}]}]});
const signature=(raw:string|Uint8Array,secret=env.WHATSAPP_WEBHOOK_SECRET!)=>'sha256='+createHmac('sha256',secret).update(raw).digest('hex');
function request(raw=payload(),sig:string|null=signature(raw),route=path){return new Request(origin+route,{method:'POST',headers:sig?{'x-hub-signature-256':sig}:{},body:raw});}
function handle(req:Request,options:StaffOptions={},config=env){return handleWorkerRequest(req,config,undefined,options);}
function recording(){
  const invoice:DeliveryWebhookEvent[][]=[],owner:DeliveryWebhookEvent[][]=[];
  const options:StaffOptions={invoiceWorkflow:{applyInvoiceWebhook:async(url,events)=>{assert.equal(url,env.DATABASE_URL);invoice.push(events);}},ownerAlerts:{applyOwnerAlertWebhook:async(url,events)=>{assert.equal(url,env.DATABASE_URL);owner.push(events);}}};
  return {invoice,owner,options};
}

test('shared callback filters sender and strips inbound content, with every action gate off',async()=>{
  const recorded=recording();
  const config={...env,APEX_PUBLIC_BOOKING_ENABLED:'false',APEX_INVOICE_APPROVAL_ENABLED:'false',APEX_INVOICE_ISSUANCE_ENABLED:'false',APEX_INVOICE_WHATSAPP_ENABLED:'false',WHATSAPP_ALERTS_ENABLED:'false'};
  const response=await handle(request(),recorded.options,config);
  assert.equal(response.status,200);assert.equal(await response.text(),'OK');assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(recorded.invoice,recorded.owner);assert.equal(recorded.invoice[0].length,2);
  assert.deepEqual(Object.keys(recorded.invoice[0][0]).sort(),['messageId','recipient','state','timestamp']);
  assert.equal((await handle(request(payload('999999999999')),recorded.options)).status,200);
  assert.equal(recorded.invoice.length,1);assert.equal(recorded.owner.length,1);
});

test('shared callback rejects absent, malformed, wrong and altered exact-byte signatures before persistence',async()=>{
  const recorded=recording(),raw=payload();
  for(const req of [request(raw,null),request(raw,'sha256=bad'),request(raw,signature(raw,'wrong-synthetic-secret')),request(raw+' ',signature(raw)),request(raw,'sha256='+'0'.repeat(64))]){
    assert.equal((await handle(req,recorded.options)).status,403);
  }
  assert.equal(recorded.invoice.length,0);assert.equal(recorded.owner.length,0);
  // Noncanonical JSON whitespace is valid when signed exactly as received.
  const spaced='\n'+raw+'\t';assert.equal((await handle(request(spaced),recorded.options)).status,200);
});

test('shared subscription verification, methods and configuration fail closed independently of legacy secrets',async()=>{
  const verify=(params:Record<string,string>={})=>new Request(origin+path+'?'+new URLSearchParams({'hub.mode':'subscribe','hub.verify_token':env.WHATSAPP_WEBHOOK_VERIFY_TOKEN!,'hub.challenge':'12345',...params}));
  const good=await handle(verify());assert.equal(good.status,200);assert.equal(await good.text(),'12345');
  assert.equal(good.headers.get('cache-control'),'no-store');
  for(const params of [{'hub.mode':'wrong'},{'hub.verify_token':'wrong'}] as Record<string,string>[])assert.equal((await handle(verify(params))).status,403);
  for(const challenge of ['', '<script>', '1'.repeat(101)])assert.equal((await handle(verify({'hub.challenge':challenge}))).status,400);
  assert.equal((await handle(new Request(origin+path,{method:'PUT'}))).status,405);
  const recorded=recording();
  for(const key of ['DATABASE_URL','WHATSAPP_WEBHOOK_SECRET','WHATSAPP_WEBHOOK_VERIFY_TOKEN','WHATSAPP_PHONE_NUMBER_ID'] as const){
    for(const invalid of ['',undefined,...(key==='WHATSAPP_WEBHOOK_SECRET'?['short']:key==='WHATSAPP_PHONE_NUMBER_ID'?['invalid']:[])]){
      const config={...env,[key]:invalid,APEX_INVOICE_WEBHOOK_SECRET:env.WHATSAPP_WEBHOOK_SECRET,APEX_INVOICE_WEBHOOK_VERIFY_TOKEN:env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,WHATSAPP_ALERT_WEBHOOK_SECRET:env.WHATSAPP_WEBHOOK_SECRET,WHATSAPP_ALERT_WEBHOOK_VERIFY_TOKEN:env.WHATSAPP_WEBHOOK_VERIFY_TOKEN};
      assert.equal((await handle(request(),recorded.options,config)).status,503);
      assert.equal((await handle(verify(),recorded.options,config)).status,503);
    }
  }
  assert.equal(recorded.invoice.length,0);assert.equal(recorded.owner.length,0);
});

test('shared callback bounds streamed raw bytes and rejects malformed signed payloads',async()=>{
  const recorded=recording();
  assert.equal((await handle(request(payload().padEnd(262144,' ')),recorded.options)).status,200);
  let cancelled=false;
  const stream=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(65536));},cancel(){cancelled=true;}});
  const streamed=new Request(origin+path,{method:'POST',body:stream,duplex:'half'} as RequestInit);
  assert.equal((await handle(streamed,recorded.options)).status,413);assert.equal(cancelled,true);
  assert.equal((await handle(new Request(origin+path,{method:'POST'}),recorded.options)).status,400);
  for(const raw of ['{','{}',JSON.stringify({object:'other',entry:[]})])assert.equal((await handle(request(raw),recorded.options)).status,503);
  assert.equal(recorded.invoice.length,1);assert.equal(recorded.owner.length,1);
});

// Transactional SQL fake: run the real store consumers through Worker-injected
// dependencies, including rollback and ON CONFLICT behavior. No Neon is used.
function storeFixture(lane:'invoice_delivery'|'owner_alert',boundId:string){
  let events=new Set<string>(),audits=0,state='provider_accepted',pendingEvents=new Set<string>(),pendingAudits=0,pendingState=state;
  const fixture={failCommit:false,calls:0,factory:()=>({connect:async()=>{},end:async()=>{},query:async(sql:string,values:unknown[]=[])=>{
    if(sql==='BEGIN'){fixture.calls++;pendingEvents=new Set(events);pendingAudits=audits;pendingState=state;}
    else if(sql==='COMMIT'){
      if(fixture.failCommit){fixture.failCommit=false;throw new Error('Synthetic commit failure');}
      events=pendingEvents;audits=pendingAudits;state=pendingState;
    }else if(sql==='ROLLBACK'){pendingEvents=new Set(events);pendingAudits=audits;pendingState=state;}
    else if(sql.startsWith('SELECT pg_advisory_xact_lock')){/* owner callback lock */}
    else if(sql.startsWith('INSERT INTO public.'+lane+'_events')){
      assert.match(sql,/ON CONFLICT DO NOTHING/);
      const key=JSON.stringify(values);if(pendingEvents.has(key))return {rows:[]};
      pendingEvents.add(key);return {rows:[{provider_message_id:values[0]}]};
    }else if(sql.startsWith('UPDATE public.'+lane+'_outbox')){
      if(values[0]===boundId&&[...pendingEvents].some(key=>{const event=JSON.parse(key);return event[0]===boundId&&event[2]==='delivered';}))pendingState='delivered';
    }else if(sql.startsWith('INSERT INTO public.'+lane+'_audit')){
      if(values[0]===boundId&&values[3]==='923000000000')pendingAudits++;
    }else throw new Error('Unexpected synthetic SQL');
    return {rows:[]};
  }} as unknown as DeliveryDb),snapshot:()=>({events:events.size,audits,state})};
  return fixture;
}

test('partial store failure returns retryable 503; replay completes both real consumers without duplicate audit effects',async()=>{
  for(const failedLane of ['invoice','owner'] as const){
    const invoice=storeFixture('invoice_delivery',invoiceId),owner=storeFixture('owner_alert',ownerId);
    const options:StaffOptions={invoiceWorkflow:{applyInvoiceWebhook:async(url,events)=>applyInvoiceWebhook(url,events,invoice.factory)},ownerAlerts:{applyOwnerAlertWebhook:async(url,events)=>applyOwnerAlertWebhook(url,events,owner.factory)}};
    (failedLane==='invoice'?invoice:owner).failCommit=true;
    assert.equal((await handle(request(),options)).status,503);
    assert.deepEqual(invoice.snapshot(),failedLane==='owner'?{events:2,audits:1,state:'delivered'}:{events:0,audits:0,state:'provider_accepted'});
    assert.deepEqual(owner.snapshot(),{events:0,audits:0,state:'provider_accepted'});
    assert.equal((await handle(request(),options)).status,200);
    assert.deepEqual(invoice.snapshot(),{events:2,audits:1,state:'delivered'});
    assert.deepEqual(owner.snapshot(),{events:2,audits:1,state:'delivered'});
    assert.equal((await handle(request(),options)).status,200);
    assert.deepEqual(invoice.snapshot(),{events:2,audits:1,state:'delivered'});
    assert.deepEqual(owner.snapshot(),{events:2,audits:1,state:'delivered'});
  }
});

test('legacy independent callback paths and secrets remain available',async()=>{
  const recorded=recording(),raw=payload();
  const config={...env,WHATSAPP_WEBHOOK_SECRET:undefined,APEX_INVOICE_WEBHOOK_SECRET:'synthetic-invoice-secret',WHATSAPP_ALERT_WEBHOOK_SECRET:'synthetic-owner-alert-secret'};
  assert.equal((await handle(request(raw,signature(raw,config.APEX_INVOICE_WEBHOOK_SECRET),'/api/invoice-delivery/webhook'),recorded.options,config)).status,200);
  assert.equal(recorded.invoice.length,1);assert.equal(recorded.owner.length,0);
  assert.equal((await handle(request(raw,signature(raw,config.WHATSAPP_ALERT_WEBHOOK_SECRET),'/api/owner-alerts/webhook'),recorded.options,config)).status,200);
  assert.equal(recorded.invoice.length,1);assert.equal(recorded.owner.length,1);
});
