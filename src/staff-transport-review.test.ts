import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStaffTransportSelection,renderStaffTransportForm} from './staff-transport-review.ts';
import {handleWorkerRequest,type WorkerEnv,type StaffContext} from './cloudflare-worker.ts';
import type {StaffInvoiceSource} from './staff-invoice-draft.ts';
import type {RouteResult} from './transport-route.ts';
import {parseNotifiedPetrolRate} from './islamabad-petrol-rate.ts';

const origin='https://example.workers.dev';
const id='123e4567-e89b-42d3-a456-426614174001';
const booking:StaffInvoiceSource={
  bookingId:id,customerName:'Synthetic Customer',petNames:'Synthetic Dog',
  petCount:1,startDate:'2026-12-01',endDate:'2026-12-03',
  status:'requested',cameraCageRequested:false,transportRequested:true,synthetic:true,
  transportLocation:{latitude:33.70,longitude:73.08,service:'both',customerConfirmed:true}
};
const env:WorkerEnv={
  DATABASE_URL:'postgresql://synthetic.invalid/no-connection',
  STAFF_ACCESS_AUD:'test-audience',STAFF_ALLOWED_EMAILS:'staff@example.test',
  APEX_STAFF_DRAFTS_ENABLED:'true',GEOAPIFY_API_KEY:'synthetic-private-key'
};
const context:StaffContext={access:{
  aud:'test-audience',getIdentity:async()=>({email:'staff@example.test'})
}};
const route:RouteResult={ok:true,estimate:{
  status:'ROUTE_REVIEW_REQUIRED',provider:'Geoapify Routing',
  routeType:'kennel_access_customer_access_kennel',
  loopDistanceKm:19.45,plannedRoundTrips:2,totalDrivenKm:38.9,
  retrievedAt:'2026-11-05T12:00:00Z',
  kennelPin:{lat:33.2992325,lon:73.2534561},
  kennelAccessWaypoint:{lat:33.31392,lon:73.25810},
  customerPin:{lat:33.70,lon:73.08},needsStaffConfirmation:true
}};
const fuel=parseNotifiedPetrolRate({effectiveDate:'2026-11-05',
  products:[{product:'Motor Spirit (Petrol)',pricePkr:362,unit:'litre'}]},
  {now:new Date('2026-11-05T12:00:00Z'),sourceUrl:'https://oilprices.pk/api/latest'});
const fields={
  id,package:'daily',visit:'both',latitude:'33.70',longitude:'73.08',
  customerConfirmed:'yes',kennelConfirmed:'yes',accessConfirmed:'yes',
  action:'quote',revision:'0'
};
const post=(data:Record<string,string>,from=origin)=>new Request(origin+'/staff/transport',{
  method:'POST',headers:{Origin:from,'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams(data).toString()
});
const deps={context,draft:async()=>booking,
  transportRoute:async()=>route,transportFuel:async()=>({ok:true,rate:fuel})};

test('transport form preloads future website choice and private pin',()=>{
  const html=renderStaffTransportForm(booking,'daily',0);
  assert.match(html,/value="33.7"/);
  assert.match(html,/value="73.08"/);
  assert.match(html,/value="both" selected/);
  assert.match(html,/kennel entrance pin/);
  assert.doesNotMatch(html,/Send invoice|Pay now/);
});
test('transport selections reject missing/duplicate identity, invalid pin and unsafe prices',()=>{
  assert.equal(parseStaffTransportSelection(new URLSearchParams(fields)).visit,'both');
  for(const bad of [
    {...fields,visit:'random'}, {...fields,latitude:'91'},
    {...fields,latitude:'NaN'}, {...fields,longitude:'74.4'},
    {...fields,package:'free'}, {...fields,revision:'-1'},
    {...fields,customerConfirmed:'fake'}
  ]) assert.throws(()=>parseStaffTransportSelection(new URLSearchParams(bad)));
  const dup=new URLSearchParams(fields);dup.append('visit','pickup');
  assert.throws(()=>parseStaffTransportSelection(dup));
  const unexpected=new URLSearchParams(fields);unexpected.set('pricePkr','1');
  assert.throws(()=>parseStaffTransportSelection(unexpected));
});
test('GET requires verified staff access and only reads private booking details',async()=>{
  let reads=0;
  const url=origin+'/staff/transport?id='+id;
  const bad=await handleWorkerRequest(new Request(url),env,undefined,{
    draft:async()=>{reads++;return booking;}
  });
  assert.equal(bad.status,403);
  assert.equal(reads,0);
  const ok=await handleWorkerRequest(new Request(url),env,undefined,{
    context,draft:async()=>{reads++;return booking;},loadReview:async()=>null
  });
  assert.equal(ok.status,200);
  assert.match(await ok.text(),/Price pickup & drop-off/);
  assert.equal(ok.headers.get('cache-control'),'private, no-store');
  assert.equal(reads,1);
});
test('POST denies forged origin and unauthenticated requests before routing',async()=>{
  let routes=0;
  const opts={...deps,transportRoute:async()=>{routes++;return route;}};
  assert.equal((await handleWorkerRequest(post(fields,'https://attacker.invalid'),
    env,undefined,opts)).status,403);
  assert.equal((await handleWorkerRequest(post(fields),env,undefined,{
    ...opts,context:undefined
  })).status,403);
  assert.equal(routes,0);
});
test('confirmed two-loop transport is priced with Fatima 20% markup and remains review only',async()=>{
  const response=await handleWorkerRequest(post(fields),env,undefined,deps);
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/Rs. 1,409/);
  assert.match(html,/Rs. 8,909/);
  assert.match(html,/38.9 km/);
  assert.match(html,/Save review-only estimate/);
  assert.doesNotMatch(html,/Send invoice|Payment approved/);
});
test('save recomputes route and fuel then freezes reviewed transport metadata',async()=>{
  let saves=0;
  const response=await handleWorkerRequest(post({...fields,action:'save'}),env,undefined,{
    ...deps,saveReview:async(_db,snapshot,revision,email)=>{
      saves++;
      assert.equal(revision,0);assert.equal(email,'staff@example.test');
      assert.equal(snapshot.quote.totalPkr,8909);
      assert.equal(snapshot.quote.lines.find(l=>l.label==='Pet transport')?.totalPkr,1409);
      assert.equal(snapshot.transport?.route.plannedRoundTrips,2);
      assert.equal(snapshot.transport?.fuelRate.pricePkrPerLitre,362);
      return {revision:1};
    }
  });
  assert.equal(response.status,303);
  assert.equal(response.headers.get('location'),'/staff/draft/saved?id='+id);
  assert.equal(saves,1);
});
test('unverified route cannot save, and unavailable fuel never gets a fallback charge',async()=>{
  let saves=0,fetches=0;
  const opts={...deps,
    transportRoute:async():Promise<RouteResult>=>({
      ok:false,reason:'PINS_NOT_VERIFIED',detail:'Confirm the drivable gate'
    }),
    transportFuel:async()=>{fetches++;return {ok:true as const,rate:fuel}},
    saveReview:async()=>{saves++;return {revision:1}}
  };
  const missing=await handleWorkerRequest(post({...fields,action:'save',customerConfirmed:''}),
    env,undefined,opts);
  assert.equal(missing.status,400);
  const denied=await handleWorkerRequest(post({...fields,action:'save'}),env,undefined,opts);
  assert.equal(denied.status,409);
  assert.equal(saves,0);
  assert.equal(fetches,0);
  const fuelDown=await handleWorkerRequest(post({...fields,action:'save'}),env,undefined,{
    ...deps,saveReview:async()=>{saves++;return {revision:1}},
    transportFuel:async()=>({ok:false as const,
      reason:'UNAVAILABLE_OR_UNVERIFIED' as const,detail:'rate unavailable'})
  });
  assert.equal(fuelDown.status,409);assert.equal(saves,0);
});
