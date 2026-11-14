import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareStaffDraftReview,type StaffInvoiceSource} from './staff-invoice-draft.ts';
import {makeReviewSnapshot,type SavedReview} from './staff-saved-review.ts';
import {prepareApproval,validateApprovalSnapshot,requireInvoiceOwner,type ApprovalInput,type ApprovalConfig} from './invoice-approval.ts';
import {approveInvoice,issueInvoice,type InvoiceDb} from './invoice-approval-store.ts';
import {buildApexInvoiceDraft} from './apex-invoice-draft.ts';
import {APEX_KENNEL_LOCATION,APEX_KENNEL_ACCESS} from './apex-location-config.ts';
import {parseNotifiedPetrolRate,FUEL_SOURCE} from './islamabad-petrol-rate.ts';
const now=new Date('2026-11-15T05:00:00Z');
const owner='owner@example.test',id='123e4567-e89b-42d3-a456-426614174001';
const booking:StaffInvoiceSource={bookingId:id,customerName:'Synthetic Fixture',petNames:'Example Dog',petCount:1,startDate:'2026-11-15',endDate:'2026-11-17',status:'requested',cameraCageRequested:false,transportRequested:false,synthetic:true};
const config:ApprovalConfig={enabled:'true',issuanceEnabled:'true',deliveryEnabled:'true',ownerEmail:owner,manualNumberFloor:'0100',bankDetailsJson:JSON.stringify({bank:'HBL',accountTitle:'SYNTHETIC TEST ONLY',accountNumber:'00000000000000',iban:'PK00HABB0000000000000000'})};
const input:ApprovalInput={bookingId:id,revision:1,invoiceNumber:'0101',confirmed:true,transportVerified:false,fuelVerified:false};
function saved():SavedReview{return {snapshot:makeReviewSnapshot(prepareStaffDraftReview(booking,'daily')),revision:1,updatedBy:owner,updatedAt:now.toISOString()};}
function transportedSaved(time=now,price=300):SavedReview{
  const s=saved();s.updatedAt=time.toISOString();
  const rate=parseNotifiedPetrolRate({products:[{product:'Petrol',unit:'litre',pricePkr:price,effectiveDate:time.toISOString().slice(0,10)}]},{now:time,sourceUrl:FUEL_SOURCE.primary});
  s.snapshot.transportService='both';
  s.snapshot.transportLocationSource='customer_record';
  s.snapshot.transport={route:{status:'ROUTE_REVIEW_REQUIRED',provider:'Geoapify Routing',routeType:'kennel_access_customer_access_kennel',loopDistanceKm:80,dropoffLoopDistanceKm:100,plannedRoundTrips:2,totalDrivenKm:180,retrievedAt:time.toISOString(),kennelPin:APEX_KENNEL_LOCATION.pin,kennelAccessWaypoint:APEX_KENNEL_ACCESS.pin,customerPin:{lat:33.7,lon:73.08},dropoffPin:{lat:33.65,lon:73.1},needsStaffConfirmation:true},fuelRate:rate};
  s.snapshot.quote=buildApexInvoiceDraft({startDate:booking.startDate,endDate:booking.endDate,cage:'normal',petCount:1,fullMonthPackageSelected:false,transport:{requested:true,totalDrivenKm:180,fuelRate:rate}}).quote;
  return s;
}
test('invoice approval is owner-only and all mutation flags default closed',()=>{
  for(const c of [{},{...config,enabled:'false'},{...config,ownerEmail:''}])assert.throws(()=>prepareApproval(saved(),input,owner,c,now));
  assert.throws(()=>prepareApproval(saved(),input,'staff@example.test',config,now),/configured invoice owner/);
  assert.throws(()=>requireInvoiceOwner(owner,{...config,issuanceEnabled:undefined},true),/disabled/);
});
test('approval rejects expired and modified revisions, missing bank and invalid sequence',()=>{
  assert.throws(()=>prepareApproval(saved(),{...input,revision:2},owner,config,now),/revision/);
  assert.throws(()=>prepareApproval({...saved(),updatedAt:'2026-11-13T00:00:00Z'},input,owner,config,now),/expired/);
  assert.throws(()=>prepareApproval(saved(),input,owner,{...config,bankDetailsJson:undefined},now),/payment/);
  assert.throws(()=>prepareApproval(saved(),input,owner,{...config,manualNumberFloor:undefined},now),/sequence/);
  assert.throws(()=>prepareApproval(saved(),{...input,invoiceNumber:'0100'},owner,config,now),/sequence/);
});
test('immutable monetary snapshot preserves customer-safe fields and exact consent evidence',()=>{
  const source=saved();
  Object.assign(source.snapshot.booking,{privateHealthNote:'MUST NEVER LEAVE REVIEW'});
  const result=prepareApproval(source,{...input,consent:{phone:'03001234567',purpose:'invoice_pdf',consentedAt:'2026-11-14T05:00:00Z',evidence:'synthetic explicit invoice PDF opt-in fixture'}},owner,config,now);
  assert.equal(result.review.quote.totalPkr,7500);
  assert.equal(result.consent?.recordedBy,owner);
  assert.equal(result.consent?.phone,'923001234567');
  assert.doesNotMatch(JSON.stringify(result),/privateHealthNote|MUST NEVER/);
  source.snapshot.quote.totalPkr=1;
  assert.equal(result.review.quote.totalPkr,7500);
  assert.deepEqual(validateApprovalSnapshot(result),result);
  assert.throws(()=>prepareApproval(saved(),{...input,consent:{phone:'03001234567',purpose:'invoice_pdf',consentedAt:'2026-12-01',evidence:'synthetic'}},owner,config,now),/consent/);
});
test('arithmetic, packages, free grooming and custom prices cannot bypass approval',()=>{
  for(const mutate of [
    (s:SavedReview)=>{s.snapshot.quote.totalPkr++;},
    (s:SavedReview)=>{s.snapshot.packageChoice='monthly';},
    (s:SavedReview)=>{s.snapshot.quote.lines[0].unitPricePkr=2400;},
    (s:SavedReview)=>{s.snapshot.quote.lines.push({label:'Private add-on',quantity:1,unitPricePkr:0,totalPkr:0});}
  ]){const s=saved();mutate(s);assert.throws(()=>prepareApproval(s,input,owner,config,now));}
});
test('Postgres jsonb object key ordering does not change approval pricing',()=>{
  const reorder=(raw:unknown):unknown=>Array.isArray(raw)?raw.map(reorder):raw&&typeof raw==='object'?Object.fromEntries(Object.entries(raw).reverse().map(([k,v])=>[k,reorder(v)])):raw;
  const s=reorder(saved()) as SavedReview;
  assert.equal(prepareApproval(s,input,owner,config,now).review.quote.totalPkr,7500);
});
function fakeDb(options:{existing?:Record<string,unknown>;numberUsed?:boolean;changed?:boolean;error?:string;snapshot?:SavedReview;pin?:Record<string,unknown>;synthetic?:boolean;sourceSynthetic?:boolean;deliveryRequested?:boolean}={}){
  const calls:{sql:string;params?:unknown[]}[]=[];
  const s=options.snapshot??saved();s.updatedAt=new Date().toISOString();
  if(options.synthetic!==undefined)s.snapshot.booking.synthetic=options.synthetic;
  const approved=prepareApproval(s,{...input,transportVerified:!!s.snapshot.transport,fuelVerified:!!s.snapshot.transport,...(options.deliveryRequested?{deliveryRequested:true,consent:{phone:'03000000000',purpose:'invoice_pdf' as const,consentedAt:new Date(Date.now()-1000).toISOString(),evidence:'Synthetic consent fixture only'}}:{})},owner,config);
  const row={id,snapshot:approved,status:'approved'};
  const db:InvoiceDb={connect:async()=>{},end:async()=>{},query:async(sql,params)=>{
    calls.push({sql,params});
    if(options.error&&sql.includes(options.error))throw new Error('synthetic database failure');
    if(sql.includes('FOR UPDATE OF b,c'))return {rows:[{id,status:'requested',start_date:booking.startDate,end_date:booking.endDate,full_name:s.snapshot.booking.customerName,pet_names:s.snapshot.booking.petNames,pet_count:options.changed?2:1,camera_cage_requested:false,pickup_dropoff_requested:!!s.snapshot.transport,synthetic:options.sourceSynthetic??s.snapshot.booking.synthetic}]};
    if(sql.includes('FROM public.booking_transport_locations'))return {rows:options.pin?[options.pin]:[]};
    if(sql.includes('FROM public.invoice_draft_reviews'))return {rows:[{snapshot:s.snapshot,revision:1,updated_by:owner,updated_at:s.updatedAt}]};
    if(sql.includes('WHERE booking_id=$1'))return {rows:options.existing?[options.existing]:[]};
    if(sql.includes('UNION ALL'))return {rows:options.numberUsed?[{invoice_number:'0101'}]:[]};
    if(sql.includes('MAX('))return {rows:[{last_number:100}]};
    if(sql.includes('WHERE id=$1 FOR UPDATE'))return {rows:[options.existing??row]};
    if(sql.startsWith('UPDATE public.approved_invoices'))return {rows:[{...row,status:'issued',pdf_sha256:params?.[2],issued_at:new Date().toISOString()}]};
    if(sql.startsWith('INSERT INTO public.approved_invoices'))return {rows:[row]};
    if(sql.startsWith('INSERT INTO public.invoice_delivery_outbox'))return {rows:[{invoice_id:id}]};
    return {rows:[]};
  }};
  return {db,calls,row};
}
test('store serializes numbering and locks saved revision before insert; commits audit atomically',async()=>{
  const {db,calls}=fakeDb();
  const result=await approveInvoice('synthetic://no-database',input,owner,config,()=>db);
  assert.equal(result.status,'approved');
  assert.ok(calls.some(c=>c.sql.includes('pg_advisory_xact_lock')));
  assert.ok(calls.some(c=>c.sql.includes('invoice_draft_reviews')&&c.sql.includes('FOR UPDATE')));
  assert.ok(calls.some(c=>c.sql.includes('invoice_approval_audit')));
  assert.equal(calls.at(-1)?.sql,'COMMIT');
});
test('duplicate invoice number, modified booking and audit write failure roll back',async()=>{
  for(const options of [{numberUsed:true},{changed:true},{error:'invoice_approval_audit'}]){
    const {db,calls}=fakeDb(options);
    await assert.rejects(approveInvoice('synthetic://no-database',input,owner,config,()=>db));
    assert.equal(calls.at(-1)?.sql,'ROLLBACK');
  }
});
test('duplicate approvals return the immutable prior invoice and never insert twice',async()=>{
  const original=fakeDb();const {db,calls}=fakeDb({existing:original.row});
  const result=await approveInvoice('synthetic://no-database',input,owner,config,()=>db);
  assert.equal(result.id,id);
  assert.ok(!calls.some(c=>c.sql.startsWith('INSERT')));
});
test('issuance persists PDF digest once, retries preserve original bytes',async()=>{
  const {db,calls}=fakeDb({synthetic:false});
  const bytes=new Uint8Array(1100);bytes.set(new TextEncoder().encode('%PDF-1.7'));
  const result=await issueInvoice('synthetic://no-database',id,owner,config,bytes,()=>db);
  assert.equal(result.status,'issued');assert.match(result.pdfSha256??'',/^[a-f0-9]{64}$/);
  assert.ok(calls.some(c=>c.sql.includes('pdf_bytes=$2')));
  const retry=fakeDb({existing:{...fakeDb({synthetic:false}).row,status:'issued',pdf_sha256:'a'.repeat(64)}});
  await issueInvoice('synthetic://no-database',id,owner,config,bytes,()=>retry.db);
  assert.ok(!retry.calls.some(c=>c.sql.startsWith('UPDATE')));
});
test('synthetic records remain internal and cannot be issued',async()=>{
  const {db}=fakeDb();const bytes=new Uint8Array(1100);bytes.set(new TextEncoder().encode('%PDF-1.7'));
  await assert.rejects(issueInvoice('synthetic://no-database',id,owner,config,bytes,()=>db),/Synthetic/);
});
test('combined approval freezes delivery intent only with all gates, explicit consent and a real record',()=>{
  const s=saved();s.snapshot.booking.synthetic=false;
  const send={...input,deliveryRequested:true,consent:{phone:'03000000000',purpose:'invoice_pdf' as const,consentedAt:now.toISOString(),evidence:'Synthetic explicit consent fixture'}};
  const prepared=prepareApproval(s,send,owner,config,now);
  assert.equal(prepared.deliveryRequested,true);
  assert.equal(validateApprovalSnapshot(prepared).deliveryRequested,true);
  assert.equal(prepareApproval(s,input,owner,config,now).deliveryRequested,false);
  const legacy={...prepared};delete (legacy as Partial<typeof legacy>).deliveryRequested;
  assert.equal(validateApprovalSnapshot(legacy).deliveryRequested,false);
  for(const c of [{...config,issuanceEnabled:undefined},{...config,deliveryEnabled:undefined}])assert.throws(()=>prepareApproval(s,send,owner,c,now),/both be enabled/);
  assert.throws(()=>prepareApproval(s,{...send,consent:undefined},owner,config,now),/explicit invoice PDF consent/);
  assert.throws(()=>prepareApproval(saved(),send,owner,config,now),/real booking/);
  assert.throws(()=>validateApprovalSnapshot({...prepared,consent:undefined}),/explicit invoice PDF consent/);
});
test('combined issuance commits its PDF, outbox and audit atomically; disabled delivery or audit failure rolls back',async()=>{
  const bytes=new Uint8Array(1100);bytes.set(new TextEncoder().encode('%PDF-1.7'));
  const fixture=fakeDb({synthetic:false,deliveryRequested:true});
  await issueInvoice('synthetic://no-database',id,owner,config,bytes,()=>fixture.db);
  const queue=fixture.calls.findIndex(c=>c.sql.startsWith('INSERT INTO public.invoice_delivery_outbox'));
  assert.ok(queue>fixture.calls.findIndex(c=>c.sql.startsWith('UPDATE public.approved_invoices')));
  assert.ok(fixture.calls.some(c=>c.sql.includes('invoice_delivery_audit')));
  assert.equal(fixture.calls.at(-1)?.sql,'COMMIT');
  const blocked=fakeDb({synthetic:false,deliveryRequested:true});
  await assert.rejects(issueInvoice('synthetic://no-database',id,owner,{...config,deliveryEnabled:undefined},bytes,()=>blocked.db),/sending is disabled/);
  assert.ok(!blocked.calls.some(c=>c.sql.startsWith('UPDATE')));
  const failed=fakeDb({synthetic:false,deliveryRequested:true,error:'invoice_delivery_audit'});
  await assert.rejects(issueInvoice('synthetic://no-database',id,owner,config,bytes,()=>failed.db),/synthetic database failure/);
  assert.equal(failed.calls.at(-1)?.sql,'ROLLBACK');
});
test('transport approval binds exact service, independent gates, and fresh distinct fuel snapshots',()=>{
  const confirmed={...input,transportVerified:true,fuelVerified:true};
  const first=prepareApproval(transportedSaved(),confirmed,owner,config,now);
  const second=prepareApproval(transportedSaved(now,350),confirmed,owner,config,now);
  assert.equal(first.review.transport?.fuelRate.pricePkrPerLitre,300);
  assert.equal(second.review.transport?.fuelRate.pricePkrPerLitre,350);
  assert.notEqual(first.review.quote.totalPkr,second.review.quote.totalPkr);
  for(const mutate of [
    (s:SavedReview)=>{delete s.snapshot.transportService;},
    (s:SavedReview)=>{delete s.snapshot.transportLocationSource;},
    (s:SavedReview)=>{s.snapshot.transportService='pickup';},
    (s:SavedReview)=>{s.snapshot.transport!.route.dropoffLoopDistanceKm=80;},
    (s:SavedReview)=>{s.snapshot.transport!.route.kennelAccessWaypoint={lat:33.7,lon:73.08};},
    (s:SavedReview)=>{s.snapshot.transport!.fuelRate.effectiveDate='2026-10-01';},
    (s:SavedReview)=>{s.snapshot.transport!.fuelRate.sourceUrl='https://unverified.example.test';},
    (s:SavedReview)=>{s.snapshot.transport!.fuelRate.retrievedAt='2026-11-13T00:00:00Z';}
  ]){const s=transportedSaved();mutate(s);assert.throws(()=>prepareApproval(s,confirmed,owner,config,now));}
  assert.throws(()=>prepareApproval(transportedSaved(),{...confirmed,fuelVerified:false},owner,config,now),/fuel/);
});
test('store locks and compares current customer-confirmed pickup and drop-off pins',async()=>{
  const pin={latitude:33.7,longitude:73.08,service:'both',customer_confirmed:true,dropoff_latitude:33.65,dropoff_longitude:73.1};
  for(const current of [pin,undefined,{...pin,customer_confirmed:false},{...pin,latitude:33.71},{...pin,dropoff_longitude:73.11},{...pin,service:'pickup'}]){
    const fixture=fakeDb({snapshot:transportedSaved(new Date()),pin:current});
    const run=approveInvoice('synthetic://no-database',{...input,transportVerified:true,fuelVerified:true},owner,config,()=>fixture.db);
    if(current===pin){await run;assert.ok(fixture.calls.some(c=>c.sql.includes('booking_transport_locations')&&c.sql.includes('FOR UPDATE')));}
    else {await assert.rejects(run,/Transport gates/);assert.equal(fixture.calls.at(-1)?.sql,'ROLLBACK');}
  }
});
test('current canary customer/pet markers cannot bypass synthetic classification',async()=>{
  for(const marker of ['customer','pet']){
    const s=saved();if(marker==='customer')s.snapshot.booking.customerName='APEX CANARY SAMPLE';else s.snapshot.booking.petNames='APEX SYNTHETIC CANARY PET';
    const fixture=fakeDb({snapshot:s,sourceSynthetic:false});
    await approveInvoice('synthetic://no-database',input,owner,config,()=>fixture.db);
    const forged=fakeDb({snapshot:s,sourceSynthetic:false,synthetic:false});
    await assert.rejects(approveInvoice('synthetic://no-database',input,owner,config,()=>forged.db),/Booking details changed/);
  }
});
test('legacy staff-confirmed pins remain approvable without inventing a customer location record',async()=>{
  const s=transportedSaved(new Date());s.snapshot.transportLocationSource='staff_confirmed';
  const confirmed={...input,transportVerified:true,fuelVerified:true};
  const legacy=fakeDb({snapshot:s});
  const approved=await approveInvoice('synthetic://no-database',confirmed,owner,config,()=>legacy.db);
  assert.equal(approved.snapshot.review.transportLocationSource,'staff_confirmed');
  assert.ok(!legacy.calls.some(c=>/INSERT INTO public.booking_transport_locations/.test(c.sql)));
  const pin={latitude:33.7,longitude:73.08,service:'both',customer_confirmed:true,dropoff_latitude:33.65,dropoff_longitude:73.1};
  const added=fakeDb({snapshot:s,pin});
  await assert.rejects(approveInvoice('synthetic://no-database',confirmed,owner,config,()=>added.db),/Transport gates or service changed/);
  const missingTable=fakeDb({snapshot:s});
  const original=missingTable.db.query;
  missingTable.db.query=async(sql,params)=>{if(sql.includes('FROM public.booking_transport_locations'))throw Object.assign(new Error('synthetic missing table'),{code:'42P01'});return original(sql,params);};
  await assert.rejects(approveInvoice('synthetic://no-database',confirmed,owner,config,()=>missingTable.db),/Confirmed current transport pins/);
});
test('a single-loop pickup cannot approve after its service changes to drop-off',async()=>{
  const s=transportedSaved(new Date());s.snapshot.transportService='pickup';
  const route=s.snapshot.transport!.route;route.plannedRoundTrips=1;route.totalDrivenKm=80;
  delete route.dropoffPin;delete route.dropoffLoopDistanceKm;
  s.snapshot.quote=buildApexInvoiceDraft({startDate:booking.startDate,endDate:booking.endDate,cage:'normal',petCount:1,fullMonthPackageSelected:false,transport:{requested:true,totalDrivenKm:80,fuelRate:s.snapshot.transport!.fuelRate}}).quote;
  const current={latitude:33.7,longitude:73.08,service:'dropoff',customer_confirmed:true,dropoff_latitude:null,dropoff_longitude:null};
  const fixture=fakeDb({snapshot:s,pin:current});
  await assert.rejects(approveInvoice('synthetic://no-database',{...input,transportVerified:true,fuelVerified:true},owner,config,()=>fixture.db),/Transport gates or service changed/);
});
test('migration enforces unique numbering, private data and immutable issued snapshots',()=>{
  const sql=readFileSync(new URL('../db/migrations/004_invoice_approval.sql',import.meta.url),'utf8');
  assert.match(sql,/booking_id uuid NOT NULL UNIQUE/);assert.match(sql,/invoice_number text NOT NULL UNIQUE/);
  assert.match(sql,/pdf_bytes IS NOT NULL AND pdf_sha256 IS NOT NULL/);
  assert.match(sql,/NEW.snapshot IS DISTINCT FROM OLD.snapshot/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql,/paid|DROP TABLE/i);
});
