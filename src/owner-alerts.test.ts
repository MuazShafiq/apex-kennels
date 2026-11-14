import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handleWorkerRequest,type WorkerEnv} from './cloudflare-worker.ts';
import {ownerAlertRoute} from './owner-alert-routes.ts';
import {validateOwnerAlertConfig,isSyntheticAlertBooking} from './owner-booking-alerts.ts';
import {sendApprovedTemplate,WhatsappError} from './whatsapp-cloud.ts';
import {renderOwnerAlerts} from './staff-owner-alerts.ts';
const owner='owner@example.test',origin='https://example.test',id='123e4567-e89b-42d3-a456-426614174001';
const config={enabled:'true',accessToken:'synthetic-token-'.repeat(4),phoneNumberId:'123456789012',apiVersion:'v26.0',template:'synthetic_owner_alert',recipient:'03000000000',consentedAt:'2026-01-01',consentEvidence:'Synthetic explicit consent'};
const env:WorkerEnv={DATABASE_URL:'synthetic://none',WHATSAPP_OWNER_EMAIL:owner,STAFF_ACCESS_AUD:'owner-alert-test-audience',STAFF_ALLOWED_EMAILS:owner+',staff@example.test',WHATSAPP_PHONE_NUMBER_ID:config.phoneNumberId,WHATSAPP_ALERT_WEBHOOK_SECRET:'synthetic-signing-secret-test',WHATSAPP_ALERT_WEBHOOK_VERIFY_TOKEN:'synthetic-verification-token'};
const context=(email=owner)=>({access:{aud:env.STAFF_ACCESS_AUD!,getIdentity:async()=>({email})}});
const row={bookingId:id,state:'ambiguous' as const,attempts:1,updatedAt:'2026-11-15T00:00:00Z',providerMessageId:null,errorKind:'ambiguous'};
const post=(action:string,fields:Record<string,string>={},headers:Record<string,string>={})=>new Request(origin+'/staff/owner-alerts/'+action,{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams({id,confirmed:'true',...fields})});

test('owner alert config requires explicit valid opt-in and canonicalizes evidence',()=>{
  const intent=validateOwnerAlertConfig(config);assert.equal(intent.recipient,'923000000000');assert.equal(intent.consent.purpose,'owner_booking_alert');
  for(const change of [{enabled:'false'},{consentedAt:''},{consentedAt:'2999-01-01'},{consentEvidence:''},{recipient:'invalid'},{template:'BAD'},{accessToken:''}])assert.throws(()=>validateOwnerAlertConfig({...config,...change}));
});
test('synthetic suppression covers existing canaries and deliberately synthetic fixtures',()=>{
  const input={source:'google_form' as const,externalResponseId:'example',customerName:'Example',petName:'Dog',startDate:'2026-12-01',endDate:'2026-12-02'};
  assert.equal(isSyntheticAlertBooking(input),false);
  for(const change of [{customerName:'APEX CANARY Test'},{customerName:'SYNTHETIC fixture'},{externalResponseId:'apex-cf-smoke-123'},{petName:'APEX SYNTHETIC CANARY PET'}])assert.equal(isSyntheticAlertBooking({...input,...change}),true);
});
test('anonymous, forged headers and ordinary staff cannot see or repair alerts',async()=>{
  for(const path of ['/staff/owner-alerts','/staff/owner-alerts?id='+id,'/staff/owner-alerts/retry','/staff/owner-alerts/reconcile']){
    const request=new Request(origin+path,{headers:{'Cf-Access-Authenticated-User-Email':owner}});
    assert.equal((await handleWorkerRequest(request,env)).status,403);
    assert.equal((await handleWorkerRequest(request,env,undefined,{context:context('staff@example.test')})).status,403);
  }
  let writes=0;
  const r=await handleWorkerRequest(post('retry'),env,undefined,{context:context(),ownerAlerts:{retryOwnerAlert:async()=>{writes++;}}});
  assert.equal(r.status,403);assert.equal(writes,0);
});
test('owner can inspect tracking with alerts disabled, without exposing recipient or care data',async()=>{
  const r=await handleWorkerRequest(new Request(origin+'/staff/owner-alerts'),env,undefined,{context:context(),ownerAlerts:{listOwnerAlerts:async()=>[row]}});
  assert.equal(r.status,200);assert.match(r.headers.get('cache-control')!,/no-store/);assert.match(r.headers.get('content-security-policy')!,/frame-ancestors 'none'/);const html=await r.text();assert.match(html,/Sending disabled/);assert.match(html,/ambiguous/);assert.match(html,/Private booking review/);assert.doesNotMatch(html,/923000000000|medication|health notes/);
});

test('repair requires same origin, strict browser form and explicit nonduplicate confirmation',async()=>{
  let writes=0;const deps={retryOwnerAlert:async()=>{writes++;}};
  for(const request of [post('retry',{}, {Origin:'https://evil.test'}),post('retry',{confirmed:'false'}),post('retry',{}, {'Content-Type':'application/json'}),post('retry',{}, {'Sec-Fetch-Site':'cross-site'}),new Request(origin+'/staff/owner-alerts/retry',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:'id='+id+'&confirmed=true&confirmed=true'})])assert((await ownerAlertRoute(request,env,owner,deps)).status>=400);
  assert.equal(writes,0);
  const r=await ownerAlertRoute(post('retry'),env,owner,deps);assert.equal(r.status,303);assert.equal(writes,1);
});
test('reconciliation passes exact actor/evidence; malformed IDs never reach persistence',async()=>{
  let count=0;
  const deps={reconcileOwnerAlert:async(_url:string,bookingId:string,by:string,input:{confirmedNotSent?:boolean;evidence:string})=>{count++;assert.equal(bookingId,id);assert.equal(by,owner);assert.equal(input.confirmedNotSent,true);assert.equal(input.evidence,'Synthetic provider evidence');}};
  assert.equal((await ownerAlertRoute(post('reconcile',{confirmedNotSent:'true',evidence:'Synthetic provider evidence'}),env,owner,deps)).status,303);
  assert.equal((await ownerAlertRoute(post('reconcile',{id:'bad'}),env,owner,deps)).status,400);assert.equal(count,1);
});
test('owner status webhook is independent from invoice gates and requires exact-byte signature',async()=>{
  let events=0;
  const raw=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:config.phoneNumberId},statuses:[{id:'wamid.synthetic_delivery_id',recipient_id:'923000000000',status:'delivered',timestamp:'1794700000'}]}}]}]});
  const sig='sha256='+createHmac('sha256',env.WHATSAPP_ALERT_WEBHOOK_SECRET!).update(raw).digest('hex');
  const deps={applyOwnerAlertWebhook:async(_url:string,received:unknown[])=>{events+=received.length;}};
  const req=(signature:string,body=raw)=>new Request(origin+'/api/owner-alerts/webhook',{method:'POST',headers:{'x-hub-signature-256':signature},body});
  assert.equal((await handleWorkerRequest(req(sig),env,undefined,{ownerAlerts:deps})).status,200);assert.equal(events,1);
  assert.equal((await handleWorkerRequest(req(sig,raw+' '),env,undefined,{ownerAlerts:deps})).status,403);
  assert.equal((await handleWorkerRequest(req('sha256='+'0'.repeat(64)),env,undefined,{ownerAlerts:deps})).status,403);assert.equal(events,1);
  assert.equal((await handleWorkerRequest(req(sig),{},undefined,{ownerAlerts:deps})).status,503);
  const verification=new URL(origin+'/api/owner-alerts/webhook');verification.search=new URLSearchParams({'hub.mode':'subscribe','hub.verify_token':env.WHATSAPP_ALERT_WEBHOOK_VERIFY_TOKEN!,'hub.challenge':'12345'}).toString();
  const verified=await handleWorkerRequest(new Request(verification),env);assert.equal(await verified.text(),'12345');
});
test('Meta response classification only permits retry on explicit Graph rejection',async()=>{
  for(const [response,kind] of [[Response.json({error:{code:100,type:'OAuthException'}},{status:400}),'failed'],[new Response('proxy timeout',{status:504}),'ambiguous'],[new Response('proxy',{status:400}),'ambiguous'],[Response.json({messages:[]}), 'ambiguous'],[new Response('x'.repeat(17000)),'ambiguous']] as const){
    await assert.rejects(()=>sendApprovedTemplate(config,config.recipient,config.template,['123E4567'],async()=>response),e=>e instanceof WhatsappError&&e.kind===kind);
  }
});
test('recovery UI escapes state text, labels controls and suppresses retries for accepted/exhausted states',()=>{
  const html=renderOwnerAlerts([{...row,errorKind:'<script>bad</script>'}],false);
  assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/Evidence reference/);assert.match(html,/name="confirmed" value="true" required/);
  const accepted=renderOwnerAlerts([{...row,state:'provider_accepted',providerMessageId:'wamid.synthetic'}],true);
  assert.match(accepted,/Delivery is not yet confirmed/);assert.match(accepted,/Record verified status/);assert.doesNotMatch(accepted,/Queue retry/);
  const exhausted=renderOwnerAlerts([{...row,state:'failed',attempts:3}],false);assert.doesNotMatch(exhausted,/Queue retry|Save reconciliation/);
});
