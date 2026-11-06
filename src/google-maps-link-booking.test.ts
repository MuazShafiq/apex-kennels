import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleWorkerRequest} from './cloudflare-worker.ts';

const base='https://example.workers.dev';
const endpoint=base+'/api/book/location';
const exact='https://www.google.com/maps?q=33.6%2C73.1';
const post=(value:unknown,origin=base)=>new Request(endpoint,{
  method:'POST',headers:{'Content-Type':'application/json',Origin:origin},
  body:JSON.stringify(value)
});
const validPin={ok:true as const,pin:{lat:33.6,lon:73.1},
  verifiedBy:'explicit_coordinates' as const,
  customerConfirmationRequired:true as const,roadEntranceConfirmed:false as const};

test('shared Maps link resolves coordinates, not an address guess, without any API key',async()=>{
  const response=await handleWorkerRequest(post({link:exact}),{},undefined,{
    resolvePin:async(raw)=>{
      assert.equal(raw,exact);return validPin;
    }
  });
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{
    latitude:33.6,longitude:73.1,
    mapsUrl:'https://www.google.com/maps/search/?api=1&query=33.6%2C73.1'
  });
  assert.equal(response.headers.get('cache-control'),'no-store');
});

test('outside service area and invalid links do not produce a customer location',async()=>{
  const outside=await handleWorkerRequest(post({link:exact}),{},undefined,{
    resolvePin:async()=>({...validPin,pin:{lat:31.5,lon:74.4}})
  });
  assert.equal(outside.status,422);
  assert.equal((await outside.json() as {code:string}).code,'OUT_OF_SERVICE_AREA');
  const notExact=await handleWorkerRequest(post({link:exact}),{},undefined,{
    resolvePin:async()=>({ok:false,reason:'NOT_EXACT_PIN'})
  });
  assert.equal(notExact.status,422);
  assert.equal((await notExact.json() as {code:string}).code,'NOT_EXACT_PIN');
});

test('link endpoint refuses cross-origin and unrelated fields without resolving anything',async()=>{
  let calls=0;
  const opt={resolvePin:async()=>{calls++;return validPin;}};
  for(const req of [
    post({link:exact},'https://attacker.invalid'),
    post({link:exact,extra:'spoof'}),
    post({link:42}),
    post({link:'x'.repeat(2200)}),
    new Request(endpoint,{method:'GET'})
  ]){
    const response=await handleWorkerRequest(req,{},undefined,opt);
    assert.ok(response.status>=400);
  }
  assert.equal(calls,0);
});

test('book page does not load third-party place search, map tiles or Maps API keys',()=>{
  const html=readFileSync('public/book/index.html','utf8');
  const js=readFileSync('public/book/app.js','utf8');
  assert.match(html,/Open Google Maps/);
  assert.match(html,/id="maps-link"/);
  assert.match(html,/Use my current location/);
  assert.doesNotMatch(html,/unpkg|maplibre|openfreemap|Geoapify|TomTom/);
  assert.doesNotMatch(js,/GEOAPIFY_API_KEY|TOMTOM_API_KEY|google\.maps\.api|api\/book\/places/);
});
