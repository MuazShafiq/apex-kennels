import test from 'node:test';
import assert from 'node:assert/strict';
import {frameForAccessRoute,downloadGeoapifyBasemap} from './apex-access-basemap.ts';
import type {AccessRouteCheck} from './check-apex-access-route.ts';

const route:AccessRouteCheck={
  status:'MAP_ROUTE_REQUIRES_HUMAN_VALIDATION',
  provider:'Geoapify Routing',
  accessPin:{lat:33.31392,lon:73.25810},
  kennelPin:{lat:33.2992325,lon:73.2534561},
  checkedAt:'2026-11-06T00:00:00Z',
  legs:[
    {direction:'bawli_to_kennel',metres:2400,seconds:300,
      snappedStartMetres:35,snappedEndMetres:10,
      geometry:{type:'MultiLineString',coordinates:[[
        [73.25810,33.31392],[73.251,33.306],[73.2534561,33.2992325]
      ]]}},
    {direction:'kennel_to_bawli',metres:2400,seconds:300,
      snappedStartMetres:10,snappedEndMetres:35,
      geometry:{type:'MultiLineString',coordinates:[[
        [73.2534561,33.2992325],[73.251,33.306],[73.25810,33.31392]
      ]]}}
  ],
  roundTripMetres:4800,
  warnings:[],
  notForBilling:true
};
const key='synthetic-test-access-map-key';
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,1]);

test('static map viewport contains whole road geometry with enough padding',()=>{
  const f=frameForAccessRoute(route);
  assert.equal(f.width,1024);
  assert.equal(f.height,700);
  assert.ok(f.zoom>11 && f.zoom<19);
  assert.ok(f.bounds[0][0]<33.2992325);
  assert.ok(f.bounds[0][1]<73.251);
  assert.ok(f.bounds[1][0]>33.31392);
  assert.ok(f.bounds[1][1]>73.2581);
  assert.ok(f.center.lat>33.2992325 && f.center.lat<33.31392);
  assert.ok(f.center.lon>73.251 && f.center.lon<73.2581);
});

test('Geoapify static map URL has correct center/zoom and key stays out of return bytes',async()=>{
  const seen:string[]=[];
  const fake:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));seen.push(String(input));
    assert.equal(url.origin,'https://maps.geoapify.com');
    assert.equal(url.pathname,'/v1/staticmap');
    assert.equal(url.searchParams.get('format'),'png');
    assert.equal(url.searchParams.get('style'),'osm-bright');
    assert.equal(url.searchParams.get('width'),'1024');
    assert.equal(url.searchParams.get('height'),'700');
    assert.equal(url.searchParams.get('apiKey'),key);
    assert.equal(init?.method,'GET');
    return new Response(png,{status:200,headers:{'Content-Type':'image/png'}});
  };
  const data=await downloadGeoapifyBasemap(frameForAccessRoute(route),key,fake);
  assert.deepEqual(data,png);
  assert.ok(!JSON.stringify([...data]).includes(key));
  assert.equal(seen.length,1);
});

test('static map authentication and invalid map images fail without exposing key',async()=>{
  const frame=frameForAccessRoute(route);
  await assert.rejects(
    downloadGeoapifyBasemap(frame,key,async()=>new Response(key,{status:401})),
    e=>e instanceof Error && /HTTP 401/.test(e.message) && !e.message.includes(key)
  );
  await assert.rejects(
    downloadGeoapifyBasemap(frame,key,async()=>new Response('oops',{status:200,headers:{'content-type':'text/plain'}})),
    /did not return PNG/
  );
  await assert.rejects(
    downloadGeoapifyBasemap(frame,key,async()=>new Response('not a png',{status:200,headers:{'content-type':'image\/png'}})),
    /invalid PNG/
  );
  await assert.rejects(
    downloadGeoapifyBasemap(frame,key,async()=>{throw new Error('https://somesite/?apiKey='+key)}),
    e=>e instanceof Error && !e.message.includes(key)
  );
});

test('malformed route coordinates cannot create a misleading map',()=>{
  assert.throws(()=>frameForAccessRoute({...route,legs:[{
    ...route.legs[0],geometry:{type:'MultiLineString',coordinates:[[[NaN,33.31]]]}
  }]}),/Invalid route geometry/);
});
