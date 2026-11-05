import {parseNotifiedPetrolRate} from './islamabad-petrol-rate.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildApexInvoiceDraft,transportFuelDraftPkr} from './apex-invoice-draft.ts';
import {renderInvoiceHtml} from './invoice.ts';

const verified400=parseNotifiedPetrolRate({
 effectiveDate:'2026-11-05',
 products:[{product:'Motor Spirit (Petrol)',pricePkr:400,unit:'litre'}]
},{now:new Date('2026-11-05T11:00:00Z'),sourceUrl:'https://oilprices.pk/api/latest'});
const basic={startDate:'2026-12-01',endDate:'2026-12-03',cage:'normal' as const,
  petCount:1,fullMonthPackageSelected:false};

test('standard 2500/day; inclusive stay; grooming always free; never sends',()=>{
  const draft=buildApexInvoiceDraft(basic);
  assert.equal(draft.quote.billedDays,3);
  assert.equal(draft.quote.totalPkr,7500);
  assert.equal(draft.quote.lines.length,1); // Don't advertise grooming nobody requested.
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
  assert.equal(transportFuelDraftPkr(12,'markup_on_fuel_cost',400),480);
  assert.equal(transportFuelDraftPkr(24,'markup_on_fuel_cost',400),960);
  const q=buildApexInvoiceDraft({...basic,transport:{
    requested:true,totalDrivenKm:24,profitBasis:'markup_on_fuel_cost',fuelRate:verified400
  }});
  assert.equal(q.quote.totalPkr,8460);
  assert.ok(q.unresolved.some(s=>s.includes('markup versus margin')));
  assert.equal(q.fuelRateSnapshot?.pricePkrPerLitre,400);
});

test('20 percent gross margin gives different amount, never silently chosen',()=>{
  assert.equal(transportFuelDraftPkr(12,'gross_margin_on_sale',400),500);
  assert.equal(transportFuelDraftPkr(24,'gross_margin_on_sale',400),1000);
  assert.notEqual(
    transportFuelDraftPkr(12,'gross_margin_on_sale',400),
    transportFuelDraftPkr(12,'markup_on_fuel_cost',400)
  );
});

test('missing route distance or profit definition leaves transport UNPRICED',()=>{
  const draft=buildApexInvoiceDraft({...basic,transport:{requested:true,totalDrivenKm:18}});
  assert.equal(draft.quote.totalPkr,7500);
  assert.equal(draft.quote.lines.filter(x=>x.label.includes('Pet transport')).length,0);
  assert.ok(draft.unresolved.some(s=>s.includes('source-backed fuel rate')));
});

test('reject invalid distances, quantities and backwards dates',()=>{
  assert.throws(()=>transportFuelDraftPkr(-1,'markup_on_fuel_cost',400),/Total driven km/);
  assert.throws(()=>transportFuelDraftPkr(0,'markup_on_fuel_cost',400),/Total driven km/);
  assert.throws(()=>transportFuelDraftPkr(12,'not-a-mode' as never,400),/supported/);
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
  assert.match(html,/INTERNAL PREVIEW/);
  assert.match(html,/PKR 7,500/);
  assert.doesNotMatch(html,/PAY NOW/);
});

test('transport stays UNPRICED without fresh rate even if distance and basis known',()=>{
  const draft=buildApexInvoiceDraft({...basic,transport:{
    requested:true,totalDrivenKm:24,profitBasis:'markup_on_fuel_cost'
  }});
  assert.equal(draft.quote.totalPkr,7500);
  assert.equal(draft.fuelRateSnapshot,undefined);
  assert.equal(draft.quote.lines.filter(x=>x.label.startsWith('Pet transport')).length,0);
});

test('transport 362/L snapshot is priced only after validated rate supplied',()=>{
  const rate=parseNotifiedPetrolRate({effectiveDate:'2026-11-05',
    products:[{product:'Motor Spirit (Petrol)',pricePkr:362,unit:'litre'}]},
    {now:new Date('2026-11-05T11:00:00Z'),sourceUrl:'https://oilprices.pk/api/latest'});
  const draft=buildApexInvoiceDraft({...basic,transport:{
    requested:true,totalDrivenKm:24,profitBasis:'markup_on_fuel_cost',fuelRate:rate
  }});
  assert.equal(draft.quote.lines.find(x=>x.label.startsWith('Transport'))?.totalPkr,869);
  assert.equal(draft.fuelRateSnapshot?.effectiveDate,'2026-11-05');
  assert.equal(draft.fuelRateSnapshot?.geographicBasis,'Pakistan national notified price; Islamabad pump freight excluded');
});

test('fuel provenance stays in INTERNAL quote data, not in customer-facing invoice',()=>{
  const fuelRate=parseNotifiedPetrolRate({
    effectiveDate:'2026-11-05',
    products:[{product:'Motor Spirit (Petrol)',pricePkr:362,unit:'litre'}]
  },{now:new Date('2026-11-05T12:00:00Z'),sourceUrl:'https://oilprices.pk/api/latest'});
  const q=buildApexInvoiceDraft({...basic,transport:{
    requested:true,totalDrivenKm:24,profitBasis:'markup_on_fuel_cost',fuelRate
  }});
  const html=renderInvoiceHtml({
    number:'FUEL-TEST',issuedOn:'2026-11-05',billedTo:'Synthetic',
    petName:'Synthetic Dog',status:'APPROVED'
  },q.quote);
  assert.equal(q.fuelRateSnapshot?.pricePkrPerLitre,362);
  assert.equal(q.fuelRateSnapshot?.sourceUrl,'https://oilprices.pk/api/latest');
  assert.match(html,/Pet transport/);
  for(const forbidden of ['OilPrices','CC BY','petrol','fuel','markup','margin',
    'Staff','STAFF','provisional','NOT PAYABLE','To be confirmed by Apex','APPROVED']) {
    assert.ok(!html.includes(forbidden),forbidden+' should not appear in customer invoice');
  }
});

test('grooming is always free but printed only when actually requested',()=>{
  const draft=buildApexInvoiceDraft({...basic,groomingRequested:true});
  assert.equal(draft.quote.totalPkr,7500);
  assert.deepEqual(draft.quote.lines.map(x=>x.totalPkr),[7500,0]);
  assert.match(renderInvoiceHtml({
    number:'GROOM',issuedOn:'2026-11-05',
    billedTo:'Sample',petName:'Dog',status:'APPROVED'
  },draft.quote),/Grooming \(complimentary\)/);
});

test('payment details shown only when owner supplies actual verified payment account',()=>{
  const draft=buildApexInvoiceDraft(basic);
  const base={number:'A-001',issuedOn:'2026-11-05',
    billedTo:'Sample',petName:'Sample Dog',status:'APPROVED' as const};
  const without=renderInvoiceHtml(base,draft.quote);
  assert.ok(!without.includes('PAYMENT DETAILS'));
  assert.ok(!without.includes('To be confirmed'));
  const withBank=renderInvoiceHtml({...base,bankDetails:{
    bankName:'Synthetic Bank',accountTitle:'Sample Account',
    iban:'PK00 TEST 0000'
  }},draft.quote);
  assert.match(withBank,/Synthetic Bank/);
  assert.match(withBank,/Sample Account/);
});

test('DRAFT invoice cannot be rendered as an unmarked customer invoice',()=>{
  const draft=buildApexInvoiceDraft(basic);
  assert.throws(()=>renderInvoiceHtml({
    number:'X',issuedOn:'2026-11-05',
    billedTo:'Customer',petName:'Pet',status:'DRAFT'
  },draft.quote),/internal-only/);
});
