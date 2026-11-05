import test from 'node:test';
import assert from 'node:assert/strict';
import {checkApexAccessRoute} from './check-apex-access-route.ts';
import {APEX_KENNEL_LOCATION,APEX_KENNEL_ACCESS} from './apex-location-config.ts';

const testKey='test-only-geographic-routing-key';

test('checks Bawli-to-kennel and kennel-to-Bawli independently with actual configured points',async()=>{
  const seen:string[]=[];
  const f:typeof fetch=async(input)=>{
    const url=new URL(String(input));
    seen.push(url.searchParams.get('waypoints')??'');
    const coordinates=seen.length===1?
      [[73.25810,33.31392],[73.256,33.307],[73.2534561,33.2992325]]:
      [[73.2534561,33.2992325],[73.256,33.307],[73.25810,33.31392]];
    return new Response(JSON.stringify({
      type:'FeatureCollection',
      features:[{type:'Feature',properties:{distance:2500,time:440},
        geometry:{type:'MultiLineString',coordinates:[coordinates]}}]
    }),{status:200});
  };
  const check=await checkApexAccessRoute({
    apiKey:testKey,fetcher:f,now:new Date('2026-11-06T04:00:00.000Z')
  });
  assert.deepEqual(seen,[
    '33.31392,73.2581|33.2992325,73.2534561',
    '33.2992325,73.2534561|33.31392,73.2581'
  ]);
  assert.deepEqual(check.kennelPin,APEX_KENNEL_LOCATION.pin);
  assert.deepEqual(check.accessPin,APEX_KENNEL_ACCESS.pin);
  assert.equal(check.roundTripMetres,5000);
  assert.equal(check.legs.length,2);
  assert.equal(check.status,'MAP_ROUTE_REQUIRES_HUMAN_VALIDATION');
  assert.equal(check.notForBilling,true);
  assert.equal(check.legs[0].snappedStartMetres,0);
  assert.equal(check.legs[0].snappedEndMetres,0);
  assert.equal(check.legs[1].snappedStartMetres,0);
  assert.equal(check.legs[1].snappedEndMetres,0);
  assert.ok(!JSON.stringify(check).includes(testKey));
  assert.ok(!JSON.stringify(check).includes('apiKey'));
});

test('snapping a venue pin onto a distant invented road produces explicit warning',async()=>{
  const f:typeof fetch=async input=>{
    const bawliFirst=new URL(String(input)).searchParams.get('waypoints')?.startsWith('33.31392');
    const coordinates=bawliFirst?
      [[73.25810,33.32392],[73.2534561,33.2992325]]:
      [[73.2534561,33.2992325],[73.25810,33.32392]];
    return new Response(JSON.stringify({features:[{
      properties:{distance:4200,time:600},
      geometry:{type:'MultiLineString',coordinates:[coordinates]}
    }]}),{status:200});
  };
  const result=await checkApexAccessRoute({apiKey:testKey,fetcher:f});
  assert.ok(result.warnings.some(x=>x.includes('snapped >150m')));
  assert.equal(result.notForBilling,true);
});

test('invalid / missing geometry is rejected; never fabricate distance',async()=>{
  const bad:typeof fetch=async()=>new Response(JSON.stringify({
    features:[{properties:{distance:1500,time:300},
      geometry:{type:'MultiLineString',coordinates:[]}}]
  }),{status:200});
  await assert.rejects(
    checkApexAccessRoute({apiKey:testKey,fetcher:bad}),
    /Incomplete or implausible provider route/
  );
});

test('API errors and keys never leak into logs',async()=>{
  const upstream:typeof fetch=async()=>new Response(testKey,{status:403});
  await assert.rejects(
    checkApexAccessRoute({apiKey:testKey,fetcher:upstream}),
    err=>err instanceof Error &&
      err.message.includes('HTTP 403') && !err.message.includes(testKey)
  );
});

test('missing key rejects before any HTTP call',async()=>{
  let count=0;
  const f:typeof fetch=async()=>{count++;throw new Error('Unexpected request');};
  await assert.rejects(
    checkApexAccessRoute({apiKey:'',fetcher:f}),
    /GEOAPIFY_API_KEY/
  );
  assert.equal(count,0);
});
