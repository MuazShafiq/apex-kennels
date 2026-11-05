import test from 'node:test';
import assert from 'node:assert/strict';
import {buildApexDraftWithFreshFuel} from './transport-invoice-draft-service.ts';
import {parseNotifiedPetrolRate, type PetrolRateResult} from './islamabad-petrol-rate.ts';

const standard={startDate:'2026-12-01',endDate:'2026-12-03',
  cage:'normal' as const,petCount:1,fullMonthPackageSelected:false};
const rate=parseNotifiedPetrolRate({
  effectiveDate:'2026-11-05',
  products:[{product:'Motor Spirit (Petrol)',pricePkr:362,unit:'litre'}]
},{now:new Date('2026-11-05T12:00:00Z'),sourceUrl:'https://oilprices.pk/api/latest'});

test('non-transport booking skips all external petrol lookups',async()=>{
  const x=await buildApexDraftWithFreshFuel(standard,async()=>{throw new Error('Should not call fuel API');});
  assert.equal(x.fuelLookup,'NOT_REQUIRED');
  assert.equal(x.draft.quote.totalPkr,7500);
  assert.equal(x.draft.fuelRateSnapshot,undefined);
});

test('new transport draft fetches 362 PKR/L and freezes source and date',async()=>{
  const x=await buildApexDraftWithFreshFuel({...standard,transport:{
    requested:true,totalDrivenKm:24,profitBasis:'markup_on_fuel_cost'
  }},async()=>({ok:true,rate}));
  assert.equal(x.fuelLookup,'CURRENT_NOTIFIED_RATE');
  assert.equal(x.draft.quote.totalPkr,8369);
  assert.equal(x.draft.fuelRateSnapshot?.pricePkrPerLitre,362);
  assert.equal(x.draft.fuelRateSnapshot?.sourceUrl,'https://oilprices.pk/api/latest');
  assert.equal(x.draft.sendAutomatically,false);
  assert.ok(x.draft.unresolved.some(s=>s.includes('Islamabad pump freight')));
});

test('upstream outage leaves transport UNPRICED, no silent fixed 400/L fallback',async()=>{
  const x=await buildApexDraftWithFreshFuel({...standard,transport:{
    requested:true,totalDrivenKm:24,profitBasis:'markup_on_fuel_cost'
  }},async()=>({ok:false,reason:'UNAVAILABLE_OR_UNVERIFIED',detail:'provider offline'}));
  assert.equal(x.fuelLookup,'MANUAL_REVIEW_REQUIRED');
  assert.equal(x.draft.quote.totalPkr,7500);
  assert.equal(x.draft.fuelRateSnapshot,undefined);
  assert.equal(x.draft.quote.lines.filter(l=>l.label.startsWith('Pet transport')).length,0);
  assert.ok(x.draft.unresolved.some(s=>s.includes('Fuel lookup unavailable')));
});

test('unexpected thrown fetch failure also leaves transport unpriced',async()=>{
  const x=await buildApexDraftWithFreshFuel({...standard,transport:{
    requested:true,totalDrivenKm:12,profitBasis:'markup_on_fuel_cost'
  }},async()=>{throw new Error('network unavailable');});
  assert.equal(x.fuelLookup,'MANUAL_REVIEW_REQUIRED');
  assert.equal(x.draft.quote.totalPkr,7500);
});

test('if route km missing, snapshot may be checked but no transport charge is invented',async()=>{
  const x=await buildApexDraftWithFreshFuel({...standard,transport:{
    requested:true,profitBasis:'markup_on_fuel_cost'
  }},async()=>({ok:true,rate}));
  assert.equal(x.fuelLookup,'CURRENT_NOTIFIED_RATE');
  assert.equal(x.draft.quote.totalPkr,7500);
  assert.equal(x.draft.fuelRateSnapshot,undefined);
  assert.ok(x.draft.unresolved.some(s=>s.includes('total driven distance')));
});

test('caller-supplied stale fuelRate is overwritten by a newly fetched one',async()=>{
  const old={...rate,pricePkrPerLitre:400};
  const x=await buildApexDraftWithFreshFuel({...standard,transport:{
    requested:true,totalDrivenKm:12,profitBasis:'markup_on_fuel_cost',fuelRate:old
  }},async()=>({ok:true,rate}));
  assert.equal(x.draft.quote.lines.find(l=>l.label.startsWith('Pet transport'))?.totalPkr,435);
  assert.equal(x.draft.fuelRateSnapshot?.pricePkrPerLitre,362);
});
