import test from 'node:test';
import assert from 'node:assert/strict';
import {buildApexInvoiceDraft,transportFuelDraftPkr} from './apex-invoice-draft.ts';
import {renderInvoiceHtml} from './invoice.ts';

const basic={startDate:'2026-12-01',endDate:'2026-12-03',cage:'normal' as const,
  petCount:1,fullMonthPackageSelected:false};

test('standard 2500/day; inclusive stay; grooming always free; never sends',()=>{
  const draft=buildApexInvoiceDraft(basic);
  assert.equal(draft.quote.billedDays,3);
  assert.equal(draft.quote.totalPkr,7500);
  assert.equal(draft.quote.lines[1].totalPkr,0);
  assert.equal(draft.status,'DRAFT_REVIEW_ONLY');
  assert.equal(draft.sendAutomatically,false);
  assert.equal(draft.requiresStaffReview,true);
});

test('camera cage 3000/day and two dogs billed as two dogs',()=>{
  const draft=buildApexInvoiceDraft({...basic,cage:'camera',petCount:2});
  assert.equal(draft.quote.totalPkr,18000);
  assert.equal(draft.quote.lines[0].quantity,6);
});

test('Fatima-approved full-month package costs 65000 PKR PER normal-cage dog',()=>{
  const draft=buildApexInvoiceDraft({
    startDate:'2026-11-01',endDate:'2026-11-30',cage:'normal',
    petCount:2,fullMonthPackageSelected:true
  });
  assert.equal(draft.quote.billedDays,30);
  assert.equal(draft.quote.lines[0].unitPricePkr,65000);
  assert.equal(draft.quote.lines[0].quantity,2);
  assert.equal(draft.quote.totalPkr,130000);
  assert.equal(draft.quote.discounts.length,0);
});

test('a 30-day stay does not silently receive monthly rate without explicit selection',()=>{
  const draft=buildApexInvoiceDraft({
    startDate:'2026-11-01',endDate:'2026-11-30',cage:'normal',
    petCount:1,fullMonthPackageSelected:false
  });
  assert.equal(draft.quote.totalPkr,75000);
});

test('camera cage monthly package must be separately priced by owner',()=>{
  assert.throws(()=>buildApexInvoiceDraft({...basic,cage:'camera',fullMonthPackageSelected:true}),/No owner-approved camera-cage monthly price/);
});

test('transport 20 percent on fuel COST: 12 km/litre, 400 PKR/litre',()=>{
  assert.equal(transportFuelDraftPkr(12,'markup_on_fuel_cost'),480);
  assert.equal(transportFuelDraftPkr(24,'markup_on_fuel_cost'),960);
  const q=buildApexInvoiceDraft({...basic,transport:{
    requested:true,totalDrivenKm:24,profitBasis:'markup_on_fuel_cost'
  }});
  assert.equal(q.quote.totalPkr,8460);
  assert.ok(q.unresolved.some(s=>s.includes('markup versus margin')));
});

test('20 percent gross margin gives different amount, never silently chosen',()=>{
  assert.equal(transportFuelDraftPkr(12,'gross_margin_on_sale'),500);
  assert.equal(transportFuelDraftPkr(24,'gross_margin_on_sale'),1000);
  assert.notEqual(
    transportFuelDraftPkr(12,'gross_margin_on_sale'),
    transportFuelDraftPkr(12,'markup_on_fuel_cost')
  );
});

test('missing route distance or profit definition leaves transport UNPRICED',()=>{
  const draft=buildApexInvoiceDraft({...basic,transport:{requested:true,totalDrivenKm:18}});
  assert.equal(draft.quote.totalPkr,7500);
  assert.equal(draft.quote.lines.filter(x=>x.label.includes('Transport')).length,0);
  assert.ok(draft.unresolved.some(s=>s.includes('staff input')));
});

test('reject invalid distances, quantities and backwards dates',()=>{
  assert.throws(()=>transportFuelDraftPkr(-1,'markup_on_fuel_cost'),/Total driven km/);
  assert.throws(()=>transportFuelDraftPkr(0,'markup_on_fuel_cost'),/Total driven km/);
  assert.throws(()=>transportFuelDraftPkr(12,'not-a-mode' as never),/supported/);
  assert.throws(()=>buildApexInvoiceDraft({...basic,petCount:0}),/Pet count/);
  assert.throws(()=>buildApexInvoiceDraft({...basic,startDate:'2026-12-04'}),/before/);
});

test('printable owner review draft carries a clear not-payable notice',()=>{
  const draft=buildApexInvoiceDraft(basic);
  const html=renderInvoiceHtml({
    number:'DRAFT-TEST',issuedOn:'2026-11-05',
    billedTo:'Synthetic Owner',petName:'Synthetic Dog',status:'DRAFT',
    reviewOnly:true
  },draft.quote);
  assert.match(html,/NOT PAYABLE/);
  assert.match(html,/PKR 7,500/);
  assert.doesNotMatch(html,/PAY NOW/);
});
