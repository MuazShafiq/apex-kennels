import type {RateTerms} from './rate-card.ts';
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
  assert.ok(x.draft.unresolved.some(s=>s.includes('Published petrol rate unavailable')));
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


test('owner-fixed fuel skips the publisher and expires at Karachi midnight without reverting',async()=>{
  const card:RateTerms={
    version:4,effectiveFrom:'2026-11-01T00:00:00+05:00',stdDaily:2675,cameraDaily:3000,
    packageDays:30,packageDiscount:10000,kmPerLitre:15,markupPct:25,freshnessHours:6,
    fuelMode:'fixed',fixedFuelPkr:330.5,fixedUntil:'2026-11-28',fixedReason:'Fixture owner pump verification',
  };
  const input={...standard,transport:{requested:true,totalDrivenKm:26.25}};
  let calls=0;
  const get=async():Promise<PetrolRateResult>=>{calls++;return {ok:true,rate};};
  const fixed=await buildApexDraftWithFreshFuel(input,get,card,new Date('2026-11-28T23:59:59.999+05:00'));
  assert.equal(fixed.fuelLookup,'OWNER_FIXED_RATE');
  assert.equal(fixed.draft.pricingSnapshot?.transport?.km,26.3);
  assert.equal(fixed.draft.pricingSnapshot?.transport?.charge,725);
  assert.match(fixed.draft.pricingSnapshot?.transport?.fuel.note??'',/Fixed by owner until 2026-11-28/);
  const expired=await buildApexDraftWithFreshFuel(input,get,card,new Date('2026-11-29T00:00:00+05:00'));
  assert.equal(expired.fuelLookup,'MANUAL_REVIEW_REQUIRED');
  assert.equal(expired.draft.pricingSnapshot?.transport,null);
  assert.match(expired.draft.unresolved.join(' '),/expired/);
  assert.equal(calls,0);
});
