import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareApproval} from './invoice-approval.ts';
import {prepareStaffDraftReview} from './staff-invoice-draft.ts';
import {makeReviewSnapshot} from './staff-saved-review.ts';
import {dispatchInvoiceDelivery,enqueueInvoiceDelivery,reconcileInvoiceDelivery,type DeliveryDb,type DeliveryDbFactory} from './invoice-delivery-store.ts';
const id='123e4567-e89b-42d3-a456-426614174001',owner='owner@example.test';
const config={enabled:'true',apiVersion:'v24.0',accessToken:'synthetic-token-'.repeat(4),phoneNumberId:'123456789012',template:'invoice_utility_pdf',language:'en_US'};
const pdf=new TextEncoder().encode('%PDF-'+'.'.repeat(1200));
function fixture(){
  const now=new Date();
  const review=makeReviewSnapshot(prepareStaffDraftReview({bookingId:id,customerName:'Synthetic Test Only',petNames:'Synthetic Dog',petCount:1,startDate:'2026-11-15',endDate:'2026-11-17',status:'requested',cameraCageRequested:false,transportRequested:false,synthetic:false},'daily'));
  const snapshot=prepareApproval({snapshot:review,revision:1,updatedBy:owner,updatedAt:now.toISOString()},{bookingId:id,revision:1,invoiceNumber:'0101',confirmed:true,transportVerified:false,fuelVerified:false,consent:{phone:'03001234567',purpose:'invoice_pdf',consentedAt:now.toISOString(),evidence:'Synthetic consent fixture'}},owner,{enabled:'true',ownerEmail:owner,manualNumberFloor:'0100',bankDetailsJson:JSON.stringify({bank:'HBL',accountTitle:'SYNTHETIC TEST ONLY',accountNumber:'00000000000000',iban:'PK00HABB0000000000000000'})},now);
  return {snapshot,status:'issued',invoice_number:'0101',pdf_bytes:pdf,pdf_sha256:createHash('sha256').update(pdf).digest('hex')};
}
function dbFixture(row:ReturnType<typeof fixture>,recipient='923001234567'){
  const queries:string[]=[];const db={connect:async()=>{},end:async()=>{},query:async(sql:string)=>{
    queries.push(sql);
    if(sql.includes("SET state='sending'"))return {rows:[{recipient,consent:row.snapshot.consent,attempts:1}]};
    if(sql.includes('FROM public.approved_invoices'))return {rows:[row]};
    return {rows:[]};
  }} as unknown as DeliveryDb;
  return {queries,factory:(()=>db) as DeliveryDbFactory};
}
test('outbox refuses modified PDF and recipient before any provider interaction',async()=>{
  for(const corrupt of ['pdf','recipient']){
    const row=fixture();if(corrupt==='pdf')row.pdf_sha256='a'.repeat(64);
    const db=dbFixture(row,corrupt==='recipient'?'923009999999':'923001234567');let calls=0;
    await assert.rejects(dispatchInvoiceDelivery('synthetic://no-db',id,config,async()=>{calls++;return new Response();},db.factory),/integrity|evidence/);
    assert.equal(calls,0);assert.equal(db.queries.at(-1),'ROLLBACK');
  }
});
test('outbox rejects synthetic records and missing explicit consent before enqueue',async()=>{
  for(const missing of ['synthetic','consent']){
    const row=fixture();if(missing==='synthetic')row.snapshot.review.booking.synthetic=true;
    else delete row.snapshot.consent;
    const db=dbFixture(row);
    await assert.rejects(enqueueInvoiceDelivery('synthetic://no-db',id,owner,db.factory),/consent/);
    assert.equal(db.queries.some(q=>q.startsWith('INSERT')),false);
    assert.equal(db.queries.at(-1),'ROLLBACK');
  }
});
test('unknown outcomes require exactly one evidenced manual reconciliation result',async()=>{
  let touched=false;const factory=(()=>{touched=true;throw new Error('Should not connect');}) as DeliveryDbFactory;
  for(const input of [{evidence:''},{evidence:'Synthetic lookup',messageId:'wamid.synthetic_123',confirmedNotSent:true},{evidence:'Synthetic lookup',messageId:'bad'}]){
    await assert.rejects(reconcileInvoiceDelivery('synthetic://no-db',id,owner,input,factory),/evidence/);
  }
  assert.equal(touched,false);
});
