/** Standalone CLI: disposable loopback PostgreSQL only. Exported suite also serves
 * the guarded development runner. All providers are fakes; no Meta credentials read. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {pathToFileURL} from 'node:url';
import {saveBooking} from '../src/booking-store.ts';
import {validateOwnerAlertConfig} from '../src/owner-booking-alerts.ts';
import {dispatchOwnerAlert,sweepOwnerAlerts,loadOwnerAlert,retryOwnerAlert,reconcileOwnerAlert,applyOwnerAlertWebhook,listOwnerAlerts} from '../src/owner-alert-store.ts';
export async function runOwnerAlertDbChecks({dbUrl,database,applySchema=true,clientFactory=connectionString=>new Client({connectionString})}){
const db=clientFactory(dbUrl);await db.connect();
const factory=clientFactory;

const owner='owner@example.test';
const config={enabled:'true',accessToken:'synthetic-test-token-'.repeat(3),phoneNumberId:'123456789012',apiVersion:'v26.0',template:'synthetic_owner_alert',recipient:'923000000000',consentedAt:'2026-01-01T00:00:00Z',consentEvidence:'Synthetic explicit owner alert opt-in'};
const intent=validateOwnerAlertConfig(config);
const pool={async connect(){const tx=factory(dbUrl);await tx.connect();return {query:(sql,params)=>tx.query(sql,params),release:()=>{void tx.end();}};}};
const input=(overrides={})=>({source:'google_form',externalResponseId:'owner-alert-fixture-'+randomUUID(),customerName:'Example Fixture Owner',email:'fixture@example.test',petName:'Example Fixture Dog',startDate:'2026-12-01',endDate:'2026-12-02',...overrides});
const fresh=async(overrides={})=>saveBooking(pool,input(overrides),intent);
const state=id=>loadOwnerAlert(dbUrl,id,factory);
let checks=0;
const pass=name=>{checks++;console.log('PASS '+name);};
function provider({reject=false,timeout=false,malformed=false,beforeAccept}={}){
  const messageId='wamid.synthetic_'+randomUUID().replaceAll('-','');let calls=0;
  return {messageId,get calls(){return calls;},fetcher:async(url,init)=>{
    calls++;assert(String(url).endsWith('/messages'));assert.equal(init.redirect,'manual');
    const body=JSON.parse(init.body);assert.equal(body.to,intent.recipient);
    assert.equal(body.template.components[0].parameters.length,1);
    assert.match(body.template.components[0].parameters[0].text,/^[A-F0-9]{8}$/);
    assert.doesNotMatch(JSON.stringify(body),/petName|customerName|phone|health|medication|example.test/);
    if(timeout)throw new Error('Synthetic network failure');
    if(reject)return Response.json({error:{code:100,type:'OAuthException'}},{status:400});
    if(malformed)return Response.json({});
    if(beforeAccept)await beforeAccept(messageId);
    return Response.json({messages:[{id:messageId}]});
  }};
}
const dispatch=(id,p,c=config)=>dispatchOwnerAlert(dbUrl,id,c,p.fetcher,factory);
const event=(messageId,state,recipient=intent.recipient)=>({messageId,recipient,state,timestamp:1794700000});
try{
  if(applySchema)for(const file of ['db/schema.sql','db/migrations/001_full_form_details.sql','db/migrations/002_whatsapp_consent.sql','db/migrations/003_invoice_draft_reviews.sql','migrations/20261106_customer_transport_locations.sql','migrations/20261111_distinct_dropoff_location.sql','db/migrations/004_invoice_approval.sql','db/migrations/005_invoice_delivery.sql','db/migrations/006_owner_booking_alerts.sql'])
    await db.query(await readFile(new URL('../'+file,import.meta.url),'utf8'));

  pass(applySchema?'baseline and additive owner alert migration apply to new loopback database':'existing development schema supports owner alert checks');
  const replay=input();const saved=await saveBooking(pool,replay,intent);
  const copies=await Promise.all([saveBooking(pool,replay,intent),saveBooking(pool,replay,intent)]);
  assert(copies.every(b=>!b.created&&b.bookingId===saved.bookingId));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.owner_alert_outbox WHERE booking_id=$1',[saved.bookingId])).rows[0].n,1);
  await assert.rejects(()=>saveBooking(pool,{...replay,petName:'Edited dog'},intent));
  pass('new Form booking commits one intent; concurrent replay and changed replay cannot duplicate');
  const disabled=await saveBooking(pool,input());
  assert.equal(await state(disabled.bookingId),null);
  await saveBooking(pool,{...replay,externalResponseId:'disabled-replay'},undefined);
  await saveBooking(pool,{...replay,externalResponseId:'disabled-replay'},intent);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.owner_alert_outbox')).rows[0].n,1);
  for(const overrides of [{customerName:'APEX CANARY example'},{petName:'APEX SYNTHETIC CANARY PET'},{externalResponseId:'apex-cf-smoke-'+randomUUID()},{customerName:'SYNTHETIC fixture'}])assert.equal(await state((await fresh(overrides)).bookingId),null);
  const web=await fresh({source:'website',externalResponseId:randomUUID()});assert.equal((await state(web.bookingId)).state,'queued');
  pass('disabled intake has no backfill; synthetic suppression; website and Form both enroll');
  const p=provider();await Promise.all([dispatch(saved.bookingId,p),dispatch(saved.bookingId,p)]);
  assert.equal(p.calls,1);assert.equal((await state(saved.bookingId)).state,'provider_accepted');
  await dispatch(saved.bookingId,p);assert.equal(p.calls,1);
  pass('concurrent claims send once and acceptance is distinct from delivery');
  const e=event(p.messageId,'delivered');await applyOwnerAlertWebhook(dbUrl,[e,e],factory);
  await applyOwnerAlertWebhook(dbUrl,[e,event(p.messageId,'failed'),event(p.messageId,'provider_accepted')],factory);
  assert.equal((await state(saved.bookingId)).state,'delivered');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.owner_alert_events WHERE provider_message_id=$1 AND state='delivered'",[p.messageId])).rows[0].n,1);
  pass('callbacks deduplicate and delivered remains terminal under out-of-order failure/acceptance');
  const early=await fresh(),pe=provider({beforeAccept:async id=>applyOwnerAlertWebhook(dbUrl,[event(id,'delivered')],factory)});
  await dispatch(early.bookingId,pe);assert.equal((await state(early.bookingId)).state,'delivered');
  const wrong=await fresh(),pw=provider();await dispatch(wrong.bookingId,pw);
  await applyOwnerAlertWebhook(dbUrl,[event(pw.messageId,'delivered','923111111111')],factory);
  assert.equal((await state(wrong.bookingId)).state,'provider_accepted');
  pass('early callback reconciles after acceptance and wrong-recipient callback is ignored');
  const rejected=await fresh(),pr=provider({reject:true});
  for(let i=0;i<3;i++){
    await dispatch(rejected.bookingId,pr);
    const row=await state(rejected.bookingId);assert.equal(row.attempts,i+1);assert.equal(row.state,i===2?'failed':'queued');
    await dispatch(rejected.bookingId,pr);assert.equal(pr.calls,i+1);
    await db.query("UPDATE public.owner_alert_outbox SET next_attempt_at=now()-interval '1 second' WHERE booking_id=$1",[rejected.bookingId]);
  }
  await assert.rejects(()=>retryOwnerAlert(dbUrl,rejected.bookingId,owner,factory));
  pass('confirmed rejection retries with delay and stops at three attempts');
  const unknown=await fresh(),pu=provider({timeout:true});await dispatch(unknown.bookingId,pu);
  assert.equal((await state(unknown.bookingId)).state,'ambiguous');
  await dispatch(unknown.bookingId,pu);assert.equal(pu.calls,1);
  await assert.rejects(()=>retryOwnerAlert(dbUrl,unknown.bookingId,owner,factory));
  await assert.rejects(()=>reconcileOwnerAlert(dbUrl,unknown.bookingId,owner,{confirmedNotSent:true,evidence:''},factory));
  await reconcileOwnerAlert(dbUrl,unknown.bookingId,owner,{confirmedNotSent:true,evidence:'Synthetic Meta no-send evidence'},factory);
  assert.equal((await state(unknown.bookingId)).state,'failed');
  await retryOwnerAlert(dbUrl,unknown.bookingId,owner,factory);const repaired=provider();await dispatch(unknown.bookingId,repaired);
  assert.equal((await state(unknown.bookingId)).state,'provider_accepted');
  pass('timeout blocks resend until evidence-backed no-send reconciliation and explicit retry');
  const malformed=await fresh(),pm=provider({malformed:true});await dispatch(malformed.bookingId,pm);
  const providerId='wamid.synthetic_reconciled_evidence';
  await applyOwnerAlertWebhook(dbUrl,[event(providerId,'delivered')],factory);
  await reconcileOwnerAlert(dbUrl,malformed.bookingId,owner,{messageId:providerId,evidence:'Synthetic provider ID evidence'},factory);
  assert.equal((await state(malformed.bookingId)).state,'delivered');
  await assert.rejects(()=>retryOwnerAlert(dbUrl,malformed.bookingId,owner,factory));
  pass('unknown acceptance reconciles provider ID and retained callback without sending');
  const stale=await fresh();await db.query("UPDATE public.owner_alert_outbox SET state='sending',attempts=1,updated_at=now()-interval '3 minutes' WHERE booking_id=$1",[stale.bookingId]);
  const sweep=provider();await sweepOwnerAlerts(dbUrl,config,sweep.fetcher,factory);
  assert.equal((await state(stale.bookingId)).state,'ambiguous');
  pass('scheduled sweep recovers lost dispatch and stale claims fail closed');
  // Hold a callback transaction open after storing delivery, while acceptance
  // attempts to attach the same provider ID. Lock rendezvous is deterministic.
  const overlap=await fresh(),po=provider();const callback=factory(dbUrl);await callback.connect();
  await callback.query('BEGIN');
  await callback.query('SELECT pg_advisory_xact_lock(hashtextextended($1,43))',[po.messageId]);
  await callback.query("INSERT INTO public.owner_alert_events(provider_message_id,recipient,state,provider_timestamp) VALUES($1,$2,'delivered',$3)",[po.messageId,intent.recipient,1794700000]);
  let reached;const waiting=new Promise(resolve=>{reached=resolve;});
  const observingFactory=url=>{const client=factory(url);const query=client.query.bind(client);client.query=(sql,params)=>{if(sql.includes('pg_advisory_xact_lock'))reached();return query(sql,params);};return client;};
  const pending=dispatchOwnerAlert(dbUrl,overlap.bookingId,config,po.fetcher,observingFactory);
  await waiting;await callback.query('COMMIT');await callback.end();await pending;
  assert.equal((await state(overlap.bookingId)).state,'delivered');
  pass('overlapping callback/acceptance transactions serialize and cannot lose delivery evidence');
  const terminal=await fresh(),pt=provider();await dispatch(terminal.bookingId,pt);
  await assert.rejects(()=>reconcileOwnerAlert(dbUrl,terminal.bookingId,owner,{deliveryState:'delivered',evidence:''},factory));
  await reconcileOwnerAlert(dbUrl,terminal.bookingId,owner,{deliveryState:'delivered',evidence:'Synthetic Meta confirmed-delivered evidence'},factory);
  assert.equal((await state(terminal.bookingId)).state,'delivered');
  await assert.rejects(()=>reconcileOwnerAlert(dbUrl,terminal.bookingId,owner,{deliveryState:'failed',evidence:'Must never downgrade delivered'},factory));
  pass('owner terminal reconciliation requires evidence and cannot downgrade confirmed delivery');
  const changed=await fresh(),pc=provider();
  await dispatch(changed.bookingId,pc,{...config,recipient:'923111111111'});assert.equal(pc.calls,0);
  await assert.rejects(()=>dispatch(changed.bookingId,pc,{...config,enabled:'false'}));
  assert.equal(pc.calls,0);
  pass('send gate and immutable recipient/config consent binding prevent changed-recipient sends');
  await db.query("UPDATE public.owner_alert_outbox SET updated_at=now()-interval '25 hours' WHERE booking_id=$1",[wrong.bookingId]);
  await sweepOwnerAlerts(dbUrl,config,provider().fetcher,factory);
  assert.equal((await state(wrong.bookingId)).errorKind,'status_overdue');
  assert((await listOwnerAlerts(dbUrl,factory)).some(a=>a.bookingId===wrong.bookingId));
  await assert.rejects(()=>db.query("UPDATE public.owner_alert_outbox SET recipient='923111111111' WHERE booking_id=$1",[wrong.bookingId]));
  await assert.rejects(()=>db.query('DELETE FROM public.owner_alert_outbox WHERE booking_id=$1',[wrong.bookingId]));
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_class WHERE relname IN ('owner_alert_outbox','owner_alert_events','owner_alert_audit') AND relrowsecurity")).rows[0].n,3);
  const all=await listOwnerAlerts(dbUrl,factory);const next=await listOwnerAlerts(dbUrl,factory,1);assert.equal(next[0].bookingId,all[1].bookingId);
  pass('overdue delivery visible; evidence immutable; paged unresolved-first tracking; RLS');
  // Force outbox persistence failure and prove no partially saved booking escaped.
  const rollback=input();const before=(await db.query('SELECT count(*)::int AS n FROM public.booking_requests')).rows[0].n;
  await assert.rejects(()=>saveBooking(pool,rollback,{...intent,senderId:null}));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.booking_requests')).rows[0].n,before);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.form_ingestion_events WHERE external_submission_id=$1',[rollback.externalResponseId])).rows[0].n,0);
  pass('booking and durable intent commit atomically or roll back together');
  console.log('PASS '+checks+' owner alert PostgreSQL integration groups; fake provider only');
}finally{await db.end();}

}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
const adminRaw=process.env.OWNER_ALERT_TEST_POSTGRES_URL;
if(!adminRaw)throw new Error('Set OWNER_ALERT_TEST_POSTGRES_URL to an explicit loopback PostgreSQL /postgres admin database.');
const adminUrl=new URL(adminRaw);
if(!['postgres:','postgresql:'].includes(adminUrl.protocol)||
  !['localhost','127.0.0.1','[::1]'].includes(adminUrl.hostname)||
  adminUrl.pathname!=='/postgres'||adminUrl.search||adminUrl.hash)
  throw new Error('This checker only accepts loopback PostgreSQL /postgres without query overrides.');
const database='apex_owner_alert_test_'+Date.now()+'_'+randomUUID().replaceAll('-','').slice(0,8);
assert.match(database,/^apex_owner_alert_test_[0-9]+_[a-f0-9]{8}$/);
const url=new URL(adminUrl);url.pathname='/'+database;const dbUrl=url.toString();
const admin=new Client({connectionString:adminRaw});await admin.connect();
try{await admin.query('CREATE DATABASE '+database);}finally{await admin.end();}
console.log('Synthetic LOCAL database: '+database+' (retained; no Neon branch used)');
await runOwnerAlertDbChecks({dbUrl,database});
}
