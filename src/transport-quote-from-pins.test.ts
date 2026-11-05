import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePinnedTransportDraft} from './transport-quote-from-pins.ts';
import {parseNotifiedPetrolRate} from './islamabad-petrol-rate.ts';
import type {RouteResult} from './transport-route.ts';

const base={startDate:'2026-12-01',endDate:'2026-12-03',
  cage:'normal' as const,petCount:1,fullMonthPackageSelected:false};
const location={
  kennelPinConfirmed:false,customerPinConfirmed:false,
  kennelAccessWaypointConfirmed:false,
  visit:'pickup_and_dropoff' as const
};
const verifiedRoute:RouteResult={ok:true,estimate:{
  status:'ROUTE_REVIEW_REQUIRED',provider:'Geoapify Routing',
  routeType:'kennel_access_customer_access_kennel',loopDistanceKm:19.45,
  plannedRoundTrips:2,totalDrivenKm:38.9,
  retrievedAt:'2026-11-05T12:00:00Z',
  kennelPin:{lat:33.654,lon:73.034},customerPin:{lat:33.704,lon:73.075},
  kennelAccessWaypoint:{lat:33.690,lon:73.061},
  needsStaffConfirmation:true
}};
const rate=parseNotifiedPetrolRate({
  effectiveDate:'2026-11-05',products:[{
    product:'Motor Spirit (Petrol)',pricePkr:362,unit:'litre'
  }]
},{now:new Date('2026-11-05T12:00:00Z'),sourceUrl:'https://oilprices.pk/api/latest'});

test('no pinned destination never guesses 24km, never fetches petrol',async()=>{
  const result=await preparePinnedTransportDraft({
    ...base,transport:{requested:true,profitBasis:'markup_on_fuel_cost',totalDrivenKm:24}
  },location,{
    route:async()=>({ok:false,reason:'PINS_NOT_VERIFIED',detail:'Missing kennel pin'}),
    fetchFuel:async()=>{throw new Error('Fuel lookup must not run')}
  });
  assert.equal(result.fuelLookup,'ROUTE_MISSING');
  assert.equal(result.draft.quote.totalPkr,7500);
  assert.equal(result.draft.fuelRateSnapshot,undefined);
  assert.match(result.draft.unresolved.join(' '),/Missing kennel pin/);
});

test('route distance replaces stale caller-submitted 24km, counts both vehicle trips',async()=>{
  const result=await preparePinnedTransportDraft({
    ...base,transport:{requested:true,totalDrivenKm:24,profitBasis:'markup_on_fuel_cost'}
  },location,{
    route:async()=>verifiedRoute,
    fetchFuel:async()=>({ok:true,rate})
  });
  assert.equal(result.fuelLookup,'CURRENT_NOTIFIED_RATE');
  assert.equal(result.draft.fuelRateSnapshot?.pricePkrPerLitre,362);
  // At 362 PKR/L and 12 km/L, 38.9 vehicle km with 20% markup:
  const amount=Math.ceil(38.9/12*362*1.2-1e-9);
  assert.equal(result.draft.quote.totalPkr,7500+amount);
  assert.match(result.draft.unresolved.join(' '),/19.45 km round trip/);
});

test('non-transport orders never hit route or petrol providers',async()=>{
  const result=await preparePinnedTransportDraft(base,location,{
    route:async()=>{throw new Error('No route needed')},
    fetchFuel:async()=>{throw new Error('No petrol needed')}
  });
  assert.equal(result.draft.quote.totalPkr,7500);
  assert.equal(result.fuelLookup,'NOT_REQUIRED');
});

test('verified route but unavailable fuel leaves transport unpriced',async()=>{
  const result=await preparePinnedTransportDraft({
    ...base,transport:{requested:true,profitBasis:'markup_on_fuel_cost'}
  },location,{
    route:async()=>verifiedRoute,
    fetchFuel:async()=>({ok:false,reason:'UNAVAILABLE_OR_UNVERIFIED',detail:'feed unavailable'})
  });
  assert.equal(result.draft.quote.totalPkr,7500);
  assert.equal(result.fuelLookup,'MANUAL_REVIEW_REQUIRED');
});
