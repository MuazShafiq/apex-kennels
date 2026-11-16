import test from 'node:test';
import assert from 'node:assert/strict';
import {placeSearchRoute,searchLocalPlaces} from './place-search.ts';
import {handleWorkerRequest} from './cloudflare-worker.ts';
const endpoint='https://apex.invalid/api/book/search';
const post=(body:unknown,extra:Record<string,string>={})=>new Request(endpoint,{method:'POST',headers:{origin:'https://apex.invalid','content-type':'application/json','cf-connecting-ip':'192.0.2.1',...extra},body:JSON.stringify(body)});
const allow={limit:async()=>({success:true})};
const env={GEOAPIFY_API_KEY:'synthetic-private-key',LOCATION_SEARCH_RATE_LIMIT:allow,LOCATION_SEARCH_USAGE_LIMIT:allow};
const row={formatted:'F-10 Markaz, Islamabad, Pakistan',address_line2:'Islamabad, Pakistan',lat:33.695,lon:73.01,country_code:'pk'};
test('real Worker dispatch preserves unavailable search and closed booking gate without persistence',async()=>{
  let writes=0;const persist=async()=>{writes++;throw new Error('Must not persist');};
  assert.equal((await handleWorkerRequest(post({query:'F-10'}),{},persist)).status,503);
  assert.equal((await handleWorkerRequest(new Request('https://apex.invalid/api/book',{method:'POST'}),{},persist)).status,503);
  assert.equal(writes,0);
});
test('provider request uses exact service rectangle, proximity bias and bounded distinct local results',async()=>{
  const results=await searchLocalPlaces('F-10 Markaz',env.GEOAPIFY_API_KEY,async(input,init)=>{
    const url=new URL(String(input));assert.equal(url.origin,'https://api.geoapify.com');
    assert.equal(url.pathname,'/v1/geocode/autocomplete');assert.equal(url.searchParams.get('filter'),'rect:72.81,33.43,73.3,33.84');
    assert.equal(url.searchParams.get('bias'),'proximity:73.06,33.65');assert.equal(url.searchParams.get('text'),'F-10 Markaz');
    assert.equal(init?.redirect,'error');assert.ok(init?.signal);
    return Response.json({results:[row,row,{...row,lon:74},{...row,country_code:'us'},{...row,formatted:'<unsafe>'},{...row,lat:'33.7'}]});
  });
  assert.deepEqual(results,[{label:row.formatted,area:row.address_line2,latitude:row.lat,longitude:row.lon}]);
});
test('search refuses missing protection, forged origin, invalid payload and exhausted limits before provider contact',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return Response.json({results:[row]});};
  assert.equal((await placeSearchRoute(post({query:'F-10'}),{},fetcher)).status,503);
  assert.equal((await placeSearchRoute(post({query:'F-10'},{origin:'https://evil.invalid'}),env,fetcher)).status,403);
  for(const body of [{query:'ab'},{query:'<unsafe>'},{query:'x'.repeat(121)},{query:'F-10',key:'spoof'},['F-10']])
    assert.equal((await placeSearchRoute(post(body),env,fetcher)).status,400);
  assert.equal((await placeSearchRoute(post({query:'F-10'}),{...env,LOCATION_SEARCH_RATE_LIMIT:{limit:async()=>({success:false})}},fetcher)).status,429);
  assert.equal((await placeSearchRoute(post({query:'F-10'}),{...env,LOCATION_SEARCH_USAGE_LIMIT:{limit:async()=>({success:false})}},fetcher)).status,429);
  assert.equal(calls,0);
});
test('bounded provider errors never leak credentials and local results remain candidate coordinates only',async()=>{
  for(const fetcher of [async()=>new Response('provider secret error',{status:403}),async()=>new Response('x'.repeat(65537)),async()=>{throw new Error('synthetic-private-key');}]){
    const response=await placeSearchRoute(post({query:'F-10'}),env,fetcher);
    assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/synthetic-private-key|provider secret/);
  }
  const response=await placeSearchRoute(post({query:'F-10'}),env,async()=>Response.json({results:[row]}));
  assert.equal(response.status,200);const body=await response.json();
  assert.equal(body.results.length,1);assert.equal(body.results[0].customerConfirmed,undefined);
  assert.equal(response.headers.get('cache-control'),'no-store');
});
