import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateQuote,countBilledDays, type PriceConfig, type Promotion} from './pricing.ts';
import {moveBooking,moveInvoice} from './workflow.ts';
import {mapFormResponse} from './google-form.ts';
import {renderInvoiceHtml} from './invoice.ts';

const config:PriceConfig = {dayCountingRule:'inclusive_days', accommodation:{camera:{label:'Camera cage',pricePerDayPkr:3000}},allowPromoWithManualDiscount:false};
const basic={startDate:'2026-10-22',endDate:'2026-11-08',petCount:1,accommodationType:'camera'};
test('Zeus invoice arithmetic without storing customer details',()=>{
 const q=calculateQuote({...basic,extras:[{label:'Pickup and dropoff',quantity:2,unitPricePkr:4000}],manualDiscount:{kind:'fixed',amountPkr:2000}},config);
 assert.equal(q.billedDays,18);assert.equal(q.subtotalPkr,62000);assert.equal(q.totalPkr,60000);
});
test('days vs nights are configurable across month boundaries',()=>{
 assert.equal(countBilledDays('2026-10-22','2026-11-08','inclusive_days'),18);
 assert.equal(countBilledDays('2026-10-22','2026-11-08','elapsed_nights'),17);
 assert.throws(()=>countBilledDays('2026-02-30','2026-03-02','inclusive_days'),/Invalid date/);
 assert.throws(()=>countBilledDays('2026-11-03','2026-11-02','inclusive_days'),/before/);
});
test('promo code case-insensitive, discount and cap',()=>{
 const promos:Promotion[]=[{code:'DEMO10',discount:{kind:'percent',basisPoints:1000},active:true,usageCount:0}];
 const q=calculateQuote({...basic,promoCode:'demo10'},config,promos,'2026-11-03');
 assert.equal(q.subtotalPkr,54000);assert.equal(q.totalPkr,48600);
 const q2=calculateQuote({...basic,promoCode:'demo10'},config,[{...promos[0],discount:{kind:'fixed',amountPkr:1000000}}],'2026-11-03');
 assert.equal(q2.totalPkr,0);
});
test('expired, usage-limited and unknown codes rejected',()=>{
 const promo:Promotion={code:'LATE',discount:{kind:'fixed',amountPkr:500},active:true,endsOn:'2026-10-01',usageCount:0};
 assert.throws(()=>calculateQuote({...basic,promoCode:'LATE'},config,[promo],'2026-11-03'),/expired/);
 assert.throws(()=>calculateQuote({...basic,promoCode:'NOPE'},config,[promo],'2026-11-03'),/Invalid promo/);
 assert.throws(()=>calculateQuote({...basic,promoCode:'LATE'},config,[{...promo,endsOn:undefined,usageLimit:1,usageCount:1}],'2026-11-03'),/limit/);
});
test('manual and promo do not silently stack',()=>{
 assert.throws(()=>calculateQuote({...basic,promoCode:'A',manualDiscount:{kind:'fixed',amountPkr:1000}},config,[{code:'A',discount:{kind:'fixed',amountPkr:1000},active:true,usageCount:0}]),/cannot be combined/);
});
test('invalid quantities, rates and percentage rejected',()=>{
 assert.throws(()=>calculateQuote({...basic,petCount:0},config),/positive integer/);
 assert.throws(()=>calculateQuote({...basic,extras:[{label:'bad',quantity:-1,unitPricePkr:12}]},config),/positive integer/);
 assert.throws(()=>calculateQuote({...basic,manualDiscount:{kind:'percent',basisPoints:20000}},config),/between/);
});
test('approval must be explicit',()=>{
 assert.equal(moveBooking('reviewing','approved'),'approved');
 assert.throws(()=>moveBooking('requested','completed'),/Invalid/);
 assert.throws(()=>moveInvoice('draft','paid'),/Invalid/);
});
test('Google form field mapping is configurable, with a required contact',()=>{
 const m={responseId:'ID',customerName:'Name',phone:'Phone',petName:'Pet',startDate:'Start',endDate:'End'};
 const row={ID:'abc123',Name:'Sample',Phone:'03000000000',Pet:'Rover',Start:'2026-11-10',End:'2026-11-13'};
 assert.equal(mapFormResponse(row,m).externalResponseId,'abc123');
 assert.throws(()=>mapFormResponse({...row,Phone:''},m),/contact/);
});
test('invoice rendering escapes customer-controlled markup',()=>{
 const q=calculateQuote(basic,config);
 const html=renderInvoiceHtml({number:'DEMO',issuedOn:'2026-11-03',billedTo:'<script>alert(1)</script>',petName:'Sample',status:'DRAFT'},q);
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(!html.includes('<script>alert(1)</script>'));
});
