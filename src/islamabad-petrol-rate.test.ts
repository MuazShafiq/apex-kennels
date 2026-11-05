import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FUEL_SOURCE,fetchCurrentIslamabadPetrolBaseline,parseNotifiedPetrolRate,
} from './islamabad-petrol-rate.ts';

const at=new Date('2026-11-05T13:00:00Z');
const mirror={effectiveDate:'2026-11-05',products:[
  {product:'Superior Kerosene Oil (SKO)',pricePkr:323.67,unit:'litre'},
  {product:'Motor Spirit (Petrol)',pricePkr:362,unit:'litre'},
  {product:'High Speed Diesel (HSD)',pricePkr:387.81,unit:'litre'},
  {product:'Liquefied Petroleum Gas (LPG)',pricePkr:294.08,unit:'kg'}
]};
const from=(value:unknown)=>parseNotifiedPetrolRate(value,{now:at,sourceUrl:FUEL_SOURCE.primary});

test('published mirror shape selects only Motor Spirit petrol and timestamps actual fetch',()=>{
  const rate=from(mirror);
  assert.equal(rate.product,'Motor Spirit (Petrol)');
  assert.equal(rate.pricePkrPerLitre,362);
  assert.equal(rate.effectiveDate,'2026-11-05');
  assert.equal(rate.retrievedAt,at.toISOString());
  assert.equal(rate.geographicBasis,'Pakistan national notified price; Islamabad pump freight excluded');
  assert.equal(rate.requiresStaffReview,true);
  assert.equal(rate.daysSinceEffective,0);
});
test('bare API array also works if product has its own effective date',()=>{
  const rate=from([{product:'Petrol',pricePkr:362,unit:'litre',effectiveDate:'2026-11-05'}]);
  assert.equal(rate.pricePkrPerLitre,362);
});
test('reject invalid fuel product, duplicate entries, wrong units, price and time',()=>{
  assert.throws(()=>from({effectiveDate:'2026-11-05',products:[
    {product:'High Speed Diesel (HSD)',pricePkr:387.81,unit:'litre'}
  ]}),/missing or ambiguous/);
  assert.throws(()=>from({effectiveDate:'2026-11-05',products:[
    {product:'Petrol',pricePkr:362,unit:'litre'},
    {product:'Petrol',pricePkr:363,unit:'litre'}
  ]}),/missing or ambiguous/);
  for(const invalid of [
    {product:'Petrol',pricePkr:362,unit:'kg'},
    {product:'Petrol',pricePkr:9999,unit:'litre'},
    {product:'Petrol',pricePkr:-1,unit:'litre'},
    {product:'Petrol',pricePkr:'362',unit:'litre'},
  ]) {
    assert.throws(()=>from({effectiveDate:'2026-11-05',products:[invalid]}));
  }
  assert.throws(()=>from({...mirror,effectiveDate:'2026-10-01'}),/stale/);
  assert.throws(()=>from({...mirror,effectiveDate:'2026-11-06'}),/future-dated/);
  assert.throws(()=>from({...mirror,effectiveDate:'2026-02-30'}),/Non-calendar/);
});

test('uses Karachi local day (UTC evening is next Pakistan day)',()=>{
  const rate=parseNotifiedPetrolRate(mirror,{
    now:new Date('2026-11-05T20:30:00Z'),sourceUrl:FUEL_SOURCE.primary
  });
  assert.equal(rate.daysSinceEffective,1);
});

test('primary API success makes no mirror request, with no API key or customer fields',async()=>{
  const seen:{url:string;options?:RequestInit}[]=[];
  const f:typeof fetch=async(input,init)=>{
    seen.push({url:String(input),options:init});
    return new Response(JSON.stringify(mirror),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await fetchCurrentIslamabadPetrolBaseline({fetcher:f,now:at});
  assert.equal(result.ok,true);
  if(result.ok)assert.equal(result.rate.sourceUrl,FUEL_SOURCE.primary);
  assert.equal(seen.length,1);
  assert.equal(seen[0].url,FUEL_SOURCE.primary);
  assert.equal(seen[0].options?.method,'GET');
  assert.equal(seen[0].options?.cache,'no-store');
});

test('API outage falls back to the same publisher GitHub mirror, not imaginary OGRA confirmation',async()=>{
  const urls:string[]=[];
  const f:typeof fetch=async input=>{
    urls.push(String(input));
    return String(input)===FUEL_SOURCE.primary
      ? new Response('temporarily down',{status:503})
      : new Response(JSON.stringify(mirror),{status:200});
  };
  const result=await fetchCurrentIslamabadPetrolBaseline({fetcher:f,now:at});
  assert.equal(result.ok,true);
  if(result.ok){
    assert.equal(result.rate.sourceUrl,FUEL_SOURCE.mirror);
    assert.equal(result.rate.publisher,'OilPrices.pk');
    assert.equal(result.rate.notificationAuthority,'OGRA');
  }
  assert.deepEqual(urls,[FUEL_SOURCE.primary,FUEL_SOURCE.mirror]);
});

test('both stale/invalid providers fail closed; no hardcoded numeric rate',async()=>{
  const f:typeof fetch=async ()=>new Response(JSON.stringify({...mirror,effectiveDate:'2026-10-01'}),{status:200});
  const result=await fetchCurrentIslamabadPetrolBaseline({fetcher:f,now:at});
  assert.equal(result.ok,false);
  if(!result.ok){
    assert.equal(result.reason,'UNAVAILABLE_OR_UNVERIFIED');
    assert.doesNotMatch(result.detail,/362|400/);
  }
});

test('two separate order lookups call provider twice, not reused cache',async()=>{
  let calls=0;
  const f:typeof fetch=async()=>{calls++;return new Response(JSON.stringify(mirror),{status:200});};
  await fetchCurrentIslamabadPetrolBaseline({fetcher:f,now:at});
  await fetchCurrentIslamabadPetrolBaseline({fetcher:f,now:at});
  assert.equal(calls,2);
});
