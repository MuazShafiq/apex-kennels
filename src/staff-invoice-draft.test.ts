import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareStaffDraftReview,parseStaffDraftRequest,renderStaffDraftReview,renderPrintableStaffReview,
  type StaffInvoiceSource
} from './staff-invoice-draft.ts';

const id='123e4567-e89b-42d3-a456-426614174001';
const standard:StaffInvoiceSource={
  bookingId:id,customerName:'SYNTHETIC TEST OWNER',petNames:'SYNTHETIC PET',
  petCount:1,startDate:'2026-12-01',endDate:'2026-12-03',
  status:'requested',cameraCageRequested:false,transportRequested:false,synthetic:true,
};

test('read-only staff estimate: confirmed daily normal rate, no payable invoice',()=>{
  const r=prepareStaffDraftReview(standard,'daily');
  assert.equal(r.draft?.quote.billedDays,3);
  assert.equal(r.draft?.quote.totalPkr,7500);
  assert.equal(r.previewOnly,true);
  assert.equal(r.canApprove,false);
  assert.equal(r.canSend,false);
  assert.ok(r.issues.some(x=>x.includes('Booking is not approved')));
  const html=renderStaffDraftReview(r);
  assert.match(html,/STAFF ESTIMATE/);
  assert.match(html,/NOT PAYABLE/);
  assert.match(html,/PKR 7,500/);
  assert.doesNotMatch(html,/Pay now|Download approved invoice|Send email|WhatsApp customer/i);
});

test('camera requested only: compute provisional 3000/day, warn selection needs checking',()=>{
  const r=prepareStaffDraftReview({...standard,cameraCageRequested:true},'daily');
  assert.equal(r.draft?.quote.totalPkr,9000);
  assert.ok(r.issues.some(x=>x.includes('REQUESTED')));
});

test('one-month normal package per dog requires explicit package choice and human eligibility confirmation',()=>{
  const b={...standard,petCount:2,startDate:'2026-11-01',endDate:'2026-11-30',synthetic:false};
  const daily=prepareStaffDraftReview(b,'daily');
  assert.equal(daily.draft?.quote.totalPkr,150000);
  const monthly=prepareStaffDraftReview(b,'monthly');
  assert.equal(monthly.draft?.quote.totalPkr,130000);
  assert.ok(monthly.issues.some(x=>x.includes('confirm dates')));
  assert.match(renderStaffDraftReview(monthly),/30-day boarding discount/);
  assert.equal(monthly.canApprove,false);
  assert.equal(monthly.canSend,false);
});

test('30-day package supports both cage types; outside-30-day stays cannot receive it',()=>{
  assert.equal(prepareStaffDraftReview(standard,'monthly').draft,null);
  assert.equal(prepareStaffDraftReview({
    ...standard,startDate:'2026-12-01',endDate:'2027-01-01'
  },'monthly').draft,null);
  const camera=prepareStaffDraftReview({
    ...standard,startDate:'2026-12-01',endDate:'2026-12-30',cameraCageRequested:true
  },'monthly');
  assert.equal(camera.draft?.quote.subtotalPkr,90000);
  assert.equal(camera.draft?.quote.totalPkr,80000);
  assert.match(renderStaffDraftReview(camera),/PKR 10,000/);
});

test('pickup requested: boarding estimate is clearly incomplete, transport never invented',()=>{
  const r=prepareStaffDraftReview({...standard,transportRequested:true},'daily');
  assert.equal(r.draft?.quote.totalPkr,7500);
  assert.equal(r.draft?.quote.lines.some(l=>l.label.includes('transport')),false);
  assert.ok(r.issues.some(x=>x.toLowerCase().includes('transport amount excluded')));
  const html=renderStaffDraftReview(r);
  assert.match(html,/transport excluded/);
  assert.doesNotMatch(html,/Transport\s+PKR/);
});

test('missing cage preference, transport preference or valid pet count blocks even preview amounts',()=>{
  assert.equal(prepareStaffDraftReview({...standard,cameraCageRequested:null},'daily').draft,null);
  assert.equal(prepareStaffDraftReview({...standard,transportRequested:null},'daily').draft,null);
  assert.equal(prepareStaffDraftReview({...standard,petCount:0},'daily').draft,null);
  assert.equal(prepareStaffDraftReview({...standard,petCount:2.5},'daily').draft,null);
});

test('review HTML escapes customer-controlled names, pet names, status and ID',()=>{
  const r=prepareStaffDraftReview({
    ...standard,customerName:'<img src=x onerror=alert(1)>',
    petNames:'Dog & <svg/onload=alert(1)>',
    status:'<script>alert(1)</script>',
  },'daily');
  const html=renderStaffDraftReview(r);
  assert.match(html,/&lt;img/);
  assert.match(html,/Dog &amp; &lt;svg/);
  assert.ok(!html.includes('<img src=x'));
  assert.match(html,/<img src="\/book\/apex-dog-mark\.svg"/);
  assert.ok(!html.includes('<svg'));
  assert.ok(!html.includes('<script'));
});

test('staff draft ID and package must be validated before any database query',()=>{
  const valid=parseStaffDraftRequest(new URL('https://example.com/staff/draft?id='+id+'&package=monthly'));
  assert.deepEqual(valid,{bookingId:id,packageChoice:'monthly'});
  for(const url of [
    '/staff/draft?id=not-uuid',
    '/staff/draft',
    '/staff/draft?id='+id+'&package=yearly',
    '/staff/draft?id=1%27%20OR%201%3D1',
  ]){
    assert.throws(()=>parseStaffDraftRequest(new URL('https://example.com'+url)));
  }
});

test('printable owner-review copy uses existing A4 invoice renderer but cannot be sent or paid',()=>{
  const standardReview=prepareStaffDraftReview({...standard,synthetic:false},'daily');
  const html=renderPrintableStaffReview(standardReview,'2026-11-06');
  assert.match(html,/INTERNAL PREVIEW · NOT FOR CUSTOMER DELIVERY/);
  assert.match(html,/REVIEW-123E4567/);
  assert.match(html,/PKR 7,500/);
  assert.match(html,/@page\{size:A4/);
  assert.doesNotMatch(html,/Payment details|IBAN|Pay now|Send invoice/);
  assert.doesNotMatch(html,/vaccination|medication|Emergency contact/i);
  const staffHtml=renderStaffDraftReview(standardReview);
  assert.match(staffHtml,/Preview Canva invoice \(PDF\)/);
});
test('printable review supports confirmed 30-day packages but blocks incomplete transport',()=>{
  const monthly=prepareStaffDraftReview({...standard,
    startDate:'2026-11-01',endDate:'2026-11-30'},'monthly');
  assert.match(renderPrintableStaffReview(monthly,'2026-11-06'),/30-day boarding discount/);
  assert.match(renderStaffDraftReview(monthly),/Preview Canva invoice \(PDF\)/);
  for(const review of [
    prepareStaffDraftReview({...standard,transportRequested:true},'daily'),
    prepareStaffDraftReview({...standard,transportRequested:null},'daily')
  ]){
    assert.throws(()=>renderPrintableStaffReview(review,'2026-11-06'),/complete boarding-only estimate/i);
    assert.doesNotMatch(renderStaffDraftReview(review),/Preview Canva invoice \(PDF\)/);
  }
});
test('30-day package is suggested automatically but staff may explicitly choose daily',()=>{
  const booking={...standard,startDate:'2026-11-01',endDate:'2026-11-30',cameraCageRequested:true};
  const automatic=prepareStaffDraftReview(booking,'auto');
  assert.equal(automatic.packageChoice,'monthly');
  assert.equal(automatic.draft?.quote.totalPkr,80000);
  const daily=prepareStaffDraftReview(booking,'daily');
  assert.equal(daily.packageChoice,'daily');
  assert.equal(daily.draft?.quote.totalPkr,90000);
  assert.equal(prepareStaffDraftReview(standard,'auto').packageChoice,'daily');
  assert.deepEqual(parseStaffDraftRequest(new URL('https://example.com/staff/draft?id='+id)),
    {bookingId:id,packageChoice:'auto'});
});
test('printable preview is always internal, synthetic is labeled and names are HTML-escaped',()=>{
  const review=prepareStaffDraftReview({
    ...standard,customerName:'<svg onload=alert(1)> & Owner'
  },'daily');
  const html=renderPrintableStaffReview(review,'2026-11-06');
  assert.match(html,/SYNTHETIC EXAMPLE/);
  assert.match(html,/&lt;svg onload=alert\(1\)&gt; &amp; Owner/);
  assert.doesNotMatch(html,/<svg onload/);
  assert.throws(()=>renderPrintableStaffReview(review,'tomorrow'),/Invalid review date/);
});
