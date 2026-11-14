/**
 * Synthetic PostgreSQL integration proof. Never accepts a remote host or an
 * existing application database. Requires an independently installed `pg` test
 * driver (npm install --no-save --package-lock=false pg), not a runtime dependency.
 * Each invocation creates a NEW local database and retains it for inspection.
 * All provider calls use explicit fakes; no environment Meta credentials are read.
 */
import assert from 'node:assert/strict';
import {randomUUID,createHash,createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {prepareStaffDraftReview} from '../src/staff-invoice-draft.ts';
import {makeReviewSnapshot} from '../src/staff-saved-review.ts';
import {approveInvoice,issueInvoice,loadApprovedInvoice,loadIssuedInvoicePdf} from '../src/invoice-approval-store.ts';
import {renderCanvaApprovedPdf} from '../src/canva-invoice-pdf.ts';
import {enqueueInvoiceDelivery,dispatchInvoiceDelivery,loadInvoiceDelivery,retryInvoiceDelivery,reconcileInvoiceDelivery,applyInvoiceWebhook} from '../src/invoice-delivery-store.ts';
import {verifyInvoiceWebhook,parseInvoiceWebhook} from '../src/invoice-delivery.ts';

const adminRaw=process.env.INVOICE_TEST_POSTGRES_URL;
if(!adminRaw)throw new Error('Set INVOICE_TEST_POSTGRES_URL to an explicit loopback PostgreSQL /postgres admin database.');
const adminUrl=new URL(adminRaw);
if(!['postgres:','postgresql:'].includes(adminUrl.protocol)||
  !['localhost','127.0.0.1','[::1]'].includes(adminUrl.hostname)||
  adminUrl.pathname!=='/postgres'||adminUrl.search||adminUrl.hash)
  throw new Error('This checker only accepts loopback PostgreSQL /postgres without query overrides.');
const database='apex_invoice_test_'+Date.now()+'_'+randomUUID().replaceAll('-','').slice(0,8);
assert.match(database,/^apex_invoice_test_[0-9]+_[a-f0-9]{8}$/);
const url=new URL(adminUrl);url.pathname='/'+database;const dbUrl=url.toString();
const admin=new Client({connectionString:adminRaw});await admin.connect();
try{await admin.query('CREATE DATABASE '+database);}finally{await admin.end();}
console.log('Synthetic LOCAL database: '+database+' (retained; no Neon branch used)');
const db=new Client({connectionString:dbUrl});await db.connect();
const factory=connectionString=>new Client({connectionString});
const owner='owner@example.test';
const config={enabled:'true',issuanceEnabled:'true',deliveryEnabled:'true',ownerEmail:owner,manualNumberFloor:'0100',
  bankDetailsJson:JSON.stringify({bank:'HBL',accountTitle:'SYNTHETIC TEST ONLY',accountNumber:'00000000000000',iban:'PK00HABB0000000000000000'})};
const deliveryConfig={enabled:'true',accessToken:'synthetic-test-token-'.repeat(3),phoneNumberId:'123456789012',apiVersion:'v24.0',template:'synthetic_invoice_pdf',language:'en_US'};
const secret='synthetic-webhook-signing-secret-only';
const recipient='923000000000';
const template=new Uint8Array(await readFile(new URL('../public/invoice/canva-blank.pdf',import.meta.url)));
let checks=0;let nextNumber=101;
const pass=name=>{checks++;console.log('PASS '+name);};
const freshNumber=()=>String(nextNumber++).padStart(4,'0');
async function fixture({consent=true,synthetic=false,deliveryRequested=consent&&!synthetic}={}){
  const bookingId=randomUUID(),customerId=randomUUID(),petId=randomUUID();
  // Every value is generated synthetic data. synthetic:false deliberately
  // exercises delivery's real-record branch with an injected provider fake.
  const source={bookingId,customerName:'SYNTHETIC DATABASE FIXTURE',petNames:'Synthetic Example Dog',petCount:1,startDate:'2026-12-01',endDate:'2026-12-03',status:'requested',cameraCageRequested:false,transportRequested:false,synthetic};
  await db.query('INSERT INTO public.customers(id,full_name,phone) VALUES($1,$2,$3)',[customerId,source.customerName,'0000000000']);
  await db.query('INSERT INTO public.pets(id,customer_id,name) VALUES($1,$2,$3)',[petId,customerId,source.petNames]);
  await db.query("INSERT INTO public.booking_requests(id,customer_id,source,external_submission_id,start_date,end_date) VALUES($1,$2,'staff',$3,$4,$5)",[bookingId,customerId,(synthetic?'apex-cf-smoke-':'invoice-db-fixture-')+bookingId,source.startDate,source.endDate]);
  await db.query('INSERT INTO public.booking_pets(booking_id,pet_id) VALUES($1,$2)',[bookingId,petId]);
  await db.query('INSERT INTO public.booking_form_details(booking_id,camera_cage_requested,pickup_dropoff_requested) VALUES($1,false,false)',[bookingId]);
  const snapshot=makeReviewSnapshot(prepareStaffDraftReview(source,'daily'));
  await db.query('INSERT INTO public.invoice_draft_reviews(booking_id,snapshot,revision,updated_by) VALUES($1,$2::jsonb,1,$3)',[bookingId,JSON.stringify(snapshot),owner]);
  return {bookingId,revision:1,invoiceNumber:freshNumber(),confirmed:true,transportVerified:false,fuelVerified:false,deliveryRequested,
    ...(consent?{consent:{phone:recipient,purpose:'invoice_pdf',consentedAt:new Date().toISOString(),evidence:'Synthetic explicit invoice PDF consent fixture'}}:{})};
}
const approve=input=>approveInvoice(dbUrl,input,owner,config,factory);
async function issued(options){
  const input=await fixture(options),invoice=await approve(input);
  const pdf=await renderCanvaApprovedPdf(invoice.snapshot,template);
  await issueInvoice(dbUrl,invoice.id,owner,config,pdf,factory);
  return {input,invoice,pdf};
}
const state=id=>loadInvoiceDelivery(dbUrl,id,factory);
async function webhook(messageId,status,timestamp=String(Math.floor(Date.now()/1000))){
  const raw=new TextEncoder().encode(JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:deliveryConfig.phoneNumberId},statuses:[{id:messageId,recipient_id:recipient,status,timestamp}]}}]}]}));
  const signature='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
  assert.equal(verifyInvoiceWebhook(raw,signature,secret),true);
  assert.equal(verifyInvoiceWebhook(raw,signature+'0',secret),false);
  await applyInvoiceWebhook(dbUrl,parseInvoiceWebhook(raw,deliveryConfig.phoneNumberId),factory);
}
function provider({messageId='wamid.synthetic_'+randomUUID().replaceAll('-',''),reject=false,timeout=false,beforeAccept}={}){
  const calls={media:0,messages:0};
  const fetcher=async(target,init)=>{
    assert(String(target).startsWith('https://graph.facebook.com/'+deliveryConfig.apiVersion+'/'+deliveryConfig.phoneNumberId+'/'));
    assert.equal(init.redirect,'manual');
    if(String(target).endsWith('/media')){
      calls.media++;assert(init.body instanceof FormData);return Response.json({id:'1234567890'});
    }
    assert(String(target).endsWith('/messages'));calls.messages++;
    const body=JSON.parse(init.body);assert.equal(body.to,recipient);
    assert.equal(body.template.components[0].parameters[0].document.id,'1234567890');
    assert.equal(JSON.stringify(body).includes('http'),false);
    if(timeout)throw new Error('Synthetic transport interruption');
    if(reject)return Response.json({error:{type:'OAuthException',code:100}},{status:400});
    if(beforeAccept)await beforeAccept(messageId);
    return Response.json({messages:[{id:messageId}]});
  };
  return {calls,fetcher,messageId};
}
try{
  for(const file of ['db/schema.sql','db/migrations/001_full_form_details.sql','db/migrations/002_whatsapp_consent.sql','db/migrations/003_invoice_draft_reviews.sql','migrations/20261106_customer_transport_locations.sql','migrations/20261111_distinct_dropoff_location.sql','db/migrations/004_invoice_approval.sql','db/migrations/005_invoice_delivery.sql'])
    await db.query(await readFile(new URL('../'+file,import.meta.url),'utf8'));
  pass('baseline plus additive migrations applied to new local database');

  const first=await fixture();
  const approvals=await Promise.all([approve(first),approve(first)]);
  assert.equal(approvals[0].id,approvals[1].id);
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM public.invoice_approval_audit WHERE invoice_id=$1',[approvals[0].id])).rows[0].n,1);
  pass('concurrent duplicate approval produces one invoice and one audit');
  const a=await fixture(),b=await fixture();b.invoiceNumber=a.invoiceNumber;
  const collision=await Promise.allSettled([approve(a),approve(b)]);
  assert.equal(collision.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(collision.filter(x=>x.status==='rejected').length,1);
  pass('concurrent invoice number collision rejects one reservation');

  const stale=await fixture();
  await assert.rejects(approve({...stale,revision:2}),/revision/);
  await db.query("UPDATE public.invoice_draft_reviews SET updated_at=now()-interval '2 days' WHERE booking_id=$1",[stale.bookingId]);
  await assert.rejects(approve(stale),/expired/);
  const changed=await fixture();
  await db.query("UPDATE public.booking_requests SET end_date='2026-12-04' WHERE id=$1",[changed.bookingId]);
  await assert.rejects(approve(changed),/changed/);
  pass('stale revision, expired review and modified booking fail closed');

  const realPdf=await issued();
  const read=await loadApprovedInvoice(dbUrl,realPdf.invoice.id,factory);
  assert.equal(read.status,'issued');
  assert.equal(read.pdfSha256,createHash('sha256').update(realPdf.pdf).digest('hex'));
  assert.deepEqual(await loadIssuedInvoicePdf(dbUrl,realPdf.invoice.id,factory),realPdf.pdf);
  const replacement=new Uint8Array(realPdf.pdf);replacement[replacement.length-10]^=1;
  await issueInvoice(dbUrl,realPdf.invoice.id,owner,config,replacement,factory);
  assert.deepEqual(await loadIssuedInvoicePdf(dbUrl,realPdf.invoice.id,factory),realPdf.pdf);
  await assert.rejects(db.query("UPDATE public.approved_invoices SET snapshot=snapshot||'{\"changed\":true}' WHERE id=$1",[realPdf.invoice.id]),/transition/);
  pass('Canva PDF persisted once; duplicate issuance and download preserve exact bytes/digest');
  assert.equal(read.snapshot.deliveryRequested,true);
  assert.equal((await state(realPdf.invoice.id)).state,'queued');
  assert.equal((await db.query("SELECT count(*)::integer AS n FROM public.invoice_delivery_audit WHERE invoice_id=$1 AND action='queued'",[realPdf.invoice.id])).rows[0].n,1);
  pass('combined approval intent issues exact PDF and atomically queues one delivery/audit');

  const rollbackInput=await fixture(),rollbackInvoice=await approve(rollbackInput);
  const rollbackPdf=await renderCanvaApprovedPdf(rollbackInvoice.snapshot,template);
  // This trigger exists only in the NEW disposable database and forces the
  // final queued-audit write to fail after PDF/status/outbox writes occurred.
  await db.query("CREATE FUNCTION public.synthetic_fail_queued_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='queued' THEN RAISE EXCEPTION 'synthetic queued audit fault'; END IF; RETURN NEW; END $$");
  await db.query('CREATE TRIGGER synthetic_queued_audit_fault BEFORE INSERT ON public.invoice_delivery_audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_fail_queued_audit()');
  try{
    await assert.rejects(issueInvoice(dbUrl,rollbackInvoice.id,owner,config,rollbackPdf,factory),/synthetic queued audit fault/);
    const rolledBack=(await db.query('SELECT status,issued_at,pdf_bytes,pdf_sha256 FROM public.approved_invoices WHERE id=$1',[rollbackInvoice.id])).rows[0];
    assert.equal(rolledBack.status,'approved');assert.equal(rolledBack.issued_at,null);assert.equal(rolledBack.pdf_bytes,null);assert.equal(rolledBack.pdf_sha256,null);
    assert.equal(await state(rollbackInvoice.id),null);
    assert.equal((await db.query("SELECT count(*)::integer AS n FROM public.invoice_approval_audit WHERE invoice_id=$1 AND action='issued'",[rollbackInvoice.id])).rows[0].n,0);
  }finally{
    await db.query('DROP TRIGGER synthetic_queued_audit_fault ON public.invoice_delivery_audit');
    await db.query('DROP FUNCTION public.synthetic_fail_queued_audit()');
  }
  await issueInvoice(dbUrl,rollbackInvoice.id,owner,config,rollbackPdf,factory);
  assert.equal((await state(rollbackInvoice.id)).state,'queued');
  pass('queued-audit fault rolls back PDF, issuance status, issuance audit and outbox together; retry recovers');

  const noConsent=await issued({consent:false});
  await assert.rejects(enqueueInvoiceDelivery(dbUrl,noConsent.invoice.id,owner,factory),/consent/);
  const syntheticInput=await fixture({synthetic:true});const syntheticInvoice=await approve(syntheticInput);
  const fakePdf=new TextEncoder().encode('%PDF-'+'.'.repeat(1100));
  await assert.rejects(issueInvoice(dbUrl,syntheticInvoice.id,owner,config,fakePdf,factory),/Synthetic/);
  await assert.rejects(approveInvoice(dbUrl,await fixture(),owner,{...config,enabled:undefined},factory),/disabled/);
  await assert.rejects(approveInvoice(dbUrl,await fixture(),'other@example.test',config,factory),/owner/);
  pass('missing consent, synthetic issuance, disabled flags and unauthorized approver blocked');

  const id=realPdf.invoice.id;
  await Promise.all([enqueueInvoiceDelivery(dbUrl,id,owner,factory),enqueueInvoiceDelivery(dbUrl,id,owner,factory)]);
  const fake=provider();
  await Promise.all([dispatchInvoiceDelivery(dbUrl,id,deliveryConfig,fake.fetcher,factory),dispatchInvoiceDelivery(dbUrl,id,deliveryConfig,fake.fetcher,factory)]);
  assert.equal(fake.calls.messages,1);assert.equal(fake.calls.media,1);
  assert.equal((await state(id)).state,'provider_accepted');
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM public.invoice_delivery_outbox WHERE invoice_id=$1',[id])).rows[0].n,1);
  pass('duplicate enqueue and concurrent dispatch produce exactly one fake provider send');
  await webhook(fake.messageId,'delivered');await webhook(fake.messageId,'delivered');await webhook(fake.messageId,'failed');await webhook(fake.messageId,'sent');
  assert.equal((await state(id)).state,'delivered');
  assert.equal((await db.query("SELECT count(*)::integer AS n FROM public.invoice_delivery_audit WHERE invoice_id=$1 AND action='webhook_delivered'",[id])).rows[0].n,1);
  pass('signed webhook replay deduplicates and late failure/acceptance cannot undo delivery');

  const early=await issued();await enqueueInvoiceDelivery(dbUrl,early.invoice.id,owner,factory);
  const earlyProvider=provider({beforeAccept:messageId=>webhook(messageId,'delivered')});
  await dispatchInvoiceDelivery(dbUrl,early.invoice.id,deliveryConfig,earlyProvider.fetcher,factory);
  assert.equal((await state(early.invoice.id)).state,'delivered');
  pass('webhook arriving before HTTP acceptance is retained and applied');

  const rejected=await issued();await enqueueInvoiceDelivery(dbUrl,rejected.invoice.id,owner,factory);
  const reject=provider({reject:true});
  for(let attempt=1;attempt<=3;attempt++){
    await dispatchInvoiceDelivery(dbUrl,rejected.invoice.id,deliveryConfig,reject.fetcher,factory);
    assert.equal((await state(rejected.invoice.id)).state,'failed');
    if(attempt<3)await retryInvoiceDelivery(dbUrl,rejected.invoice.id,owner,factory);
  }
  await assert.rejects(retryInvoiceDelivery(dbUrl,rejected.invoice.id,owner,factory),/remaining attempts/);
  assert.equal(reject.calls.messages,3);assert.equal((await state(rejected.invoice.id)).attempts,3);
  pass('definite Meta failures require manual retry, bounded to three attempts');

  const ambiguous=await issued();await enqueueInvoiceDelivery(dbUrl,ambiguous.invoice.id,owner,factory);
  const timeout=provider({timeout:true});
  await dispatchInvoiceDelivery(dbUrl,ambiguous.invoice.id,deliveryConfig,timeout.fetcher,factory);
  assert.equal((await state(ambiguous.invoice.id)).state,'ambiguous');
  await assert.rejects(retryInvoiceDelivery(dbUrl,ambiguous.invoice.id,owner,factory),/reconcile/);
  await dispatchInvoiceDelivery(dbUrl,ambiguous.invoice.id,deliveryConfig,timeout.fetcher,factory);
  assert.equal(timeout.calls.messages,1);
  await reconcileInvoiceDelivery(dbUrl,ambiguous.invoice.id,owner,{confirmedNotSent:true,evidence:'Synthetic provider lookup confirms no accepted message'},factory);
  assert.equal((await state(ambiguous.invoice.id)).state,'failed');
  await retryInvoiceDelivery(dbUrl,ambiguous.invoice.id,owner,factory);
  const repaired=provider();await dispatchInvoiceDelivery(dbUrl,ambiguous.invoice.id,deliveryConfig,repaired.fetcher,factory);
  assert.equal((await state(ambiguous.invoice.id)).state,'provider_accepted');
  pass('timeout is ambiguous without resend; evidenced reconciliation enables separate safe retry');

  const crashed=await issued();await enqueueInvoiceDelivery(dbUrl,crashed.invoice.id,owner,factory);
  await db.query("UPDATE public.invoice_delivery_outbox SET state='sending',attempts=1,updated_at=now()-interval '3 minutes' WHERE invoice_id=$1",[crashed.invoice.id]);
  const never=provider();await dispatchInvoiceDelivery(dbUrl,crashed.invoice.id,deliveryConfig,never.fetcher,factory);
  assert.equal(never.calls.messages,0);assert.equal((await state(crashed.invoice.id)).state,'ambiguous');
  const recoveredId='wamid.recovered_'+randomUUID().replaceAll('-','');
  await webhook(recoveredId,'delivered');
  await reconcileInvoiceDelivery(dbUrl,crashed.invoice.id,owner,{messageId:recoveredId,evidence:'Synthetic provider lookup found the accepted message ID'},factory);
  assert.equal((await state(crashed.invoice.id)).state,'delivered');
  pass('crashed send becomes ambiguous; recovered provider ID applies early delivery evidence');

  await assert.rejects(db.query("UPDATE public.invoice_delivery_outbox SET recipient='923009999999' WHERE invoice_id=$1",[id]),/Immutable/);
  await assert.rejects(db.query('DELETE FROM public.invoice_delivery_audit WHERE invoice_id=$1',[id]),/append only/);
  await assert.rejects(db.query('DELETE FROM public.invoice_delivery_events'),/append only/);
  await assert.rejects(db.query("UPDATE public.invoice_delivery_outbox SET state='failed' WHERE invoice_id=$1",[id]),/transition/);
  const tables=['approved_invoices','invoice_approval_audit','invoice_delivery_outbox','invoice_delivery_audit','invoice_delivery_events'];
  const secured=await db.query('SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace=$1::regnamespace AND relname=ANY($2)', ['public',tables]);
  assert.equal(secured.rows.length,tables.length);assert(secured.rows.every(x=>x.relrowsecurity));
  await db.query('BEGIN');
  try{
    const role='invoice_untrusted_'+randomUUID().replaceAll('-','').slice(0,8);
    await db.query('CREATE ROLE '+role);
    await db.query('GRANT USAGE ON SCHEMA public TO '+role);
    await db.query('GRANT SELECT ON '+tables.map(t=>'public.'+t).join(',')+' TO '+role);
    await db.query('SET LOCAL ROLE '+role);
    for(const table of tables)assert.equal((await db.query('SELECT count(*)::integer AS n FROM public.'+table)).rows[0].n,0);
  }finally{await db.query('ROLLBACK');}
  pass('append-only evidence, monotonic transitions and deny-by-default RLS verified with untrusted role');
  console.log('PASS '+checks+' integration groups; all provider interactions fake; database '+database);
}finally{await db.end();}
