/** Disposable loopback PostgreSQL proof only. No production URL or provider calls. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {recordInvoiceCorrection,loadInvoiceCorrection} from '../src/invoice-correction.ts';
import {issueInvoice} from '../src/invoice-approval-store.ts';
import {enqueueInvoiceDelivery,dispatchInvoiceDelivery,retryInvoiceDelivery} from '../src/invoice-delivery-store.ts';
import {makeReviewSnapshot} from '../src/staff-saved-review.ts';
import {prepareStaffDraftReview} from '../src/staff-invoice-draft.ts';
import {prepareApproval} from '../src/invoice-approval.ts';

const raw=process.env.INVOICE_TEST_POSTGRES_URL;
if(!raw)throw new Error('Explicit disposable loopback /postgres required');
const adminUrl=new URL(raw);
if(!['postgres:','postgresql:'].includes(adminUrl.protocol)||!['localhost','127.0.0.1','[::1]'].includes(adminUrl.hostname)||adminUrl.pathname!=='/postgres'||adminUrl.search||adminUrl.hash)throw new Error('Loopback /postgres only');
const database='apex_correction_test_'+Date.now()+'_'+randomUUID().replaceAll('-','').slice(0,8);
const admin=new Client({connectionString:raw});await admin.connect();
try{await admin.query('CREATE DATABASE '+database);}finally{await admin.end();}
const url=new URL(adminUrl);url.pathname='/'+database;
const dbUrl=url.toString(),factory=connectionString=>new Client({connectionString});
const db=factory(dbUrl);await db.connect();
const actor='owner@example.test',config={enabled:'true',issuanceEnabled:'true',ownerEmail:actor,manualNumberFloor:'0100',bankDetailsJson:JSON.stringify({bank:'HBL',accountTitle:'SYNTHETIC TEST ONLY',accountNumber:'00000000000000',iban:'PK00HABB0000000000000000'})};
const deliveryConfig={enabled:'true',accessToken:'synthetic-test-token-'.repeat(3),phoneNumberId:'123456789012',apiVersion:'v24.0',template:'synthetic_invoice_pdf',language:'en_US'};
let next=101,groups=0;
const pass=name=>{groups++;console.log('PASS '+name);};
async function fixture(issued=false,state){
  const bookingId=randomUUID(),customer=randomUUID(),id=randomUUID();
  await db.query('INSERT INTO public.customers(id,full_name,phone) VALUES($1,$2,$3)',[customer,'Correction Fixture Owner','0000000000']);
  await db.query("INSERT INTO public.booking_requests(id,customer_id,source,start_date,end_date) VALUES($1,$2,'staff','2026-12-01','2026-12-03')",[bookingId,customer]);
  const review=makeReviewSnapshot(prepareStaffDraftReview({bookingId,customerName:'Correction Fixture Owner',petNames:'Fixture Dog',petCount:1,startDate:'2026-12-01',endDate:'2026-12-03',status:'requested',cameraCageRequested:false,transportRequested:false,synthetic:false},'daily'));
  const snapshot=prepareApproval({snapshot:review,revision:1,updatedBy:actor,updatedAt:new Date().toISOString()},{bookingId,revision:1,invoiceNumber:String(next++).padStart(4,'0'),confirmed:true,transportVerified:false,fuelVerified:false},actor,config);
  await db.query('INSERT INTO public.approved_invoices(id,booking_id,invoice_number,snapshot) VALUES($1,$2,$3,$4::jsonb)',[id,bookingId,snapshot.invoiceNumber,JSON.stringify(snapshot)]);
  if(issued)await issueInvoice(dbUrl,id,actor,config,new TextEncoder().encode('%PDF-'+'.'.repeat(1200)),factory);
  if(state){
    await db.query('INSERT INTO public.invoice_delivery_outbox(invoice_id,recipient,consent) VALUES($1,$2,$3::jsonb)',[id,'923000000000',JSON.stringify({purpose:'invoice_pdf',phone:'923000000000',consentedAt:new Date().toISOString(),evidence:'Synthetic fixture',recordedBy:actor})]);
    if(state==='sending'||state==='ambiguous'){
      await db.query("UPDATE public.invoice_delivery_outbox SET state='sending',attempts=1 WHERE invoice_id=$1",[id]);
      if(state==='ambiguous')await db.query("UPDATE public.invoice_delivery_outbox SET state='ambiguous',error_kind='ambiguous' WHERE invoice_id=$1",[id]);
    }
  }
  return {id,snapshot};
}
try{
  for(const file of ['db/schema.sql','db/migrations/001_full_form_details.sql','db/migrations/002_whatsapp_consent.sql','db/migrations/003_invoice_draft_reviews.sql','db/migrations/004_invoice_approval.sql','db/migrations/005_invoice_delivery.sql','db/migrations/007_invoice_corrections.sql'])await db.query(await readFile(new URL('../'+file,import.meta.url),'utf8'));
  const first=await fixture(true,'queued');
  const before=(await db.query('SELECT snapshot,pdf_bytes,pdf_sha256 FROM public.approved_invoices WHERE id=$1',[first.id])).rows[0];
  await assert.rejects(recordInvoiceCorrection(dbUrl,first.id,'other@example.test',config,{kind:'cancel',reason:'Synthetic correction'},factory),/Only the configured/);
  await recordInvoiceCorrection(dbUrl,first.id,actor,config,{kind:'cancel',reason:'Synthetic correction'},factory);
  assert.equal((await loadInvoiceCorrection(dbUrl,first.id,factory)).kind,'cancel');
  assert.deepEqual((await db.query('SELECT snapshot,pdf_bytes,pdf_sha256 FROM public.approved_invoices WHERE id=$1',[first.id])).rows[0],before);
  await assert.rejects(db.query('DELETE FROM public.invoice_corrections WHERE invoice_id=$1',[first.id]),/append-only/);
  await assert.rejects(recordInvoiceCorrection(dbUrl,first.id,actor,config,{kind:'cancel',reason:'Duplicate'},factory),/recorded correction/);
  pass('owner-only immutable cancellation ledger preserves issued snapshot and PDF');
  let network=0;
  for(const op of [()=>issueInvoice(dbUrl,first.id,actor,config,new TextEncoder().encode('%PDF-'+'.'.repeat(1200)),factory),()=>enqueueInvoiceDelivery(dbUrl,first.id,actor,factory),()=>retryInvoiceDelivery(dbUrl,first.id,actor,factory),()=>dispatchInvoiceDelivery(dbUrl,first.id,deliveryConfig,async()=>{network++;throw new Error('No provider allowed');},factory)])await assert.rejects(op(),/recorded correction/);
  assert.equal(network,0);
  assert.equal((await db.query('SELECT state FROM public.invoice_delivery_outbox WHERE invoice_id=$1',[first.id])).rows[0].state,'queued');
  pass('cancelled invoice blocks issue, enqueue, retry and dispatch before networking');
  for(const state of ['sending','ambiguous']){
    const f=await fixture(true,state);
    await assert.rejects(recordInvoiceCorrection(dbUrl,f.id,actor,config,{kind:'cancel',reason:'Synthetic correction'},factory),/Reconcile/);
    assert.equal(await loadInvoiceCorrection(dbUrl,f.id,factory),null);
  }
  pass('unresolved provider outcomes reject correction');
  const replacement=await fixture(true);
  await recordInvoiceCorrection(dbUrl,replacement.id,actor,config,{kind:'replace',reason:'Synthetic corrected charge',replacementNumber:'0800',replacementReference:'Synthetic Canva ledger reference'},factory);
  assert.equal((await loadInvoiceCorrection(dbUrl,replacement.id,factory)).replacementNumber,'0800');
  const another=await fixture(true);
  await assert.rejects(recordInvoiceCorrection(dbUrl,another.id,actor,config,{kind:'replace',reason:'Duplicate number',replacementNumber:'0800',replacementReference:'Synthetic reference'},factory),/reserved/);
  pass('manual replacement has immutable evidence and globally reserved number');
  const race=await fixture(true,'queued'),held=factory(dbUrl);await held.connect();
  await held.query('BEGIN');await held.query('SELECT pg_advisory_xact_lock(hashtextextended($1,72))',[race.id]);
  // Observe rejection immediately: after COMMIT the blocked claim may reject
  // before held.end() completes, which otherwise becomes an unhandled rejection.
  let settled=false;const pending=dispatchInvoiceDelivery(dbUrl,race.id,deliveryConfig,async()=>{network++;throw new Error('No provider allowed');},factory)
    .then(()=>{settled=true;return null;},error=>{settled=true;return error;});
  // A query against the actual lock wait establishes this is a concurrent blocked claim.
  let waiting=false;
  for(let i=0;i<100&&!waiting;i++){
    await new Promise(resolve=>setTimeout(resolve,20));
    waiting=(await db.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted) AS waiting")).rows[0].waiting;
  }
  assert.equal(waiting,true);assert.equal(settled,false);
  await held.query("INSERT INTO public.invoice_corrections(invoice_id,kind,reason,actor) VALUES($1,'cancel','Synthetic race correction',$2)",[race.id,actor]);
  await held.query('COMMIT');await held.end();
  const rejected=await pending;
  assert(rejected instanceof Error,'Blocked claim must reject after cancellation');
  assert.match(rejected.message,/recorded correction/);assert.equal(network,0);
  pass('concurrent cancellation wins before blocked claim; no provider request');
  console.log('PASS '+groups+' correction groups; disposable LOCAL database '+database+' retained; no Neon branch or provider');
}finally{await db.end();}
