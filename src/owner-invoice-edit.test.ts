import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateOwnerQuote,validateOwnerQuote} from './owner-invoice-pricing.ts';
import {prepareOwnerEdit,saveOwnerInvoiceEdit} from './owner-invoice-edit.ts';
import {validateApprovalPricing} from './invoice-approval.ts';
import {makeReviewSnapshot,type SavedReview} from './staff-saved-review.ts';
import {prepareStaffDraftReview} from './staff-invoice-draft.ts';
const owner='owner@example.test',id='123e4567-e89b-42d3-a456-426614174001';
function saved():SavedReview{return {snapshot:makeReviewSnapshot(prepareStaffDraftReview({bookingId:id,customerName:'TEST ONLY Editor',petNames:'Demo Dog',petCount:1,startDate:'2026-11-15',endDate:'2026-11-17',status:'requested',cameraCageRequested:false,transportRequested:false,synthetic:true},'daily')),revision:1,updatedBy:owner,updatedAt:new Date().toISOString()};}
const rows={lines:[{label:'Owner boarding price',quantity:2,unitPricePkr:1200},{label:'Complimentary wash',quantity:1,unitPricePkr:0},{label:'Custom charge',quantity:3,unitPricePkr:100}],discounts:[{label:'Owner discount',amountPkr:200}]};
test('owner edits recalculate rows and discounts, preserve source and synthetic flag, reorder/delete/reset and undo',()=>{
 const initial=saved(),edited=prepareOwnerEdit(initial,rows,'edit',owner);
 assert.equal(edited.quote.totalPkr,2500);assert.equal(edited.ownerOverride?.sourceQuote.totalPkr,7500);assert.equal(edited.booking.synthetic,true);
 assert.deepEqual(validateApprovalPricing(edited).quote.lines.map(l=>l.label),rows.lines.map(l=>l.label));
 const reopened={...initial,snapshot:edited,revision:2};
 const reordered=prepareOwnerEdit(reopened,{...rows,lines:[rows.lines[2],rows.lines[0]]},'edit',owner);assert.equal(reordered.quote.lines[0].label,'Custom charge');
 const reset=prepareOwnerEdit(reopened,null,'reset',owner);assert.equal(reset.quote.totalPkr,7500);
 const undone=prepareOwnerEdit(reopened,null,'undo',owner);assert.equal(undone.quote.totalPkr,7500);
 const empty=prepareOwnerEdit(reopened,{lines:[],discounts:[]},'edit',owner);assert.equal(empty.quote.totalPkr,0);assert.doesNotThrow(()=>validateApprovalPricing(empty));
 assert.equal(initial.snapshot.quote.totalPkr,7500);assert.equal(initial.snapshot.ownerOverride,undefined);
});
test('owner input rejects overflow, unsafe descriptions, negative totals and oversized row sets; client totals are ignored',()=>{
 const source=saved().snapshot.quote;
 for(const invalid of [
  {...rows,lines:[{label:'X',quantity:2,unitPricePkr:Number.MAX_SAFE_INTEGER}]},
  {...rows,lines:[{label:'<script>',quantity:1,unitPricePkr:1}]},
  {...rows,lines:[{label:'Unsafe\ntext',quantity:1,unitPricePkr:1}]},
  {...rows,lines:[{label:'Unsupported اردو',quantity:1,unitPricePkr:1}]},
  {...rows,lines:[{label:'X',quantity:0,unitPricePkr:1}]},
  {...rows,discounts:[{label:'Too much',amountPkr:9999}]},
  {...rows,lines:Array.from({length:61},()=>rows.lines[0])},
  {...rows,discounts:Array.from({length:21},()=>rows.discounts[0])},
  {...rows,lines:[{label:'X',quantity:1,unitPricePkr:NaN}]},
  {...rows,lines:[{label:'X',quantity:1,unitPricePkr:-1}]}
 ])assert.throws(()=>calculateOwnerQuote(source,invalid));
 assert.equal(calculateOwnerQuote(source,{...rows,totalPkr:1}).totalPkr,2500);
 const q=calculateOwnerQuote(source,rows);assert.throws(()=>validateOwnerQuote({...q,totalPkr:1},source));
 const edit=prepareOwnerEdit(saved(),rows,'edit',owner);edit.ownerOverride!.sourceQuote.lines[0].unitPricePkr=1;assert.throws(()=>validateApprovalPricing(edit));
});
test('owner edit persistence checks owner and stale revision, and rolls back approved immutable snapshots',async()=>{
 const config={enabled:'true',ownerEmail:owner};let connects=0,queries:string[]=[];
 const factory=()=>({connect:async()=>{connects++;},end:async()=>{},query:async(sql:string)=>{queries.push(sql);return {rows:sql.startsWith('SELECT id FROM public.approved_invoices')?[{id}]:[]};}});
 await assert.rejects(saveOwnerInvoiceEdit('fake',id,1,rows,'edit','staff@example.test',config,factory),/Only/);assert.equal(connects,0);
 await assert.rejects(saveOwnerInvoiceEdit('fake',id,1,rows,'edit',owner,config,factory),/frozen/);assert(queries.includes('ROLLBACK'));assert(!queries.some(q=>q.startsWith('UPDATE')));
 queries=[];const stale=()=>({...factory(),query:async(sql:string)=>{queries.push(sql);return {rows:sql.startsWith('SELECT snapshot')?[{snapshot:saved().snapshot,revision:2,updated_by:owner,updated_at:new Date().toISOString()}]:[]};}});
 await assert.rejects(saveOwnerInvoiceEdit('fake',id,1,rows,'edit',owner,config,stale),/another tab/);
});
