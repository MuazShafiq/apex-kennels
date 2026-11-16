import test from 'node:test';
import assert from 'node:assert/strict';
import {placeSearchRoute,searchLocalPlaces,normalizePlaceQuery,matchesRequestedPlace} from './place-search.ts';
import {handleWorkerRequest} from './cloudflare-worker.ts';
const endpoint='https://apex.invalid/api/book/search';
const post=(body:unknown,extra:Record<string,string>={})=>new Request(endpoint,{method:'POST',headers:{origin:'https://apex.invalid','content-type':'application/json','cf-connecting-ip':'192.0.2.1',...extra},body:JSON.stringify(body)});
const allow={limit:async()=>({success:true})};
const budget={idFromName:()=>0,get:()=>({fetch:async()=>Response.json({success:true})})};
const env={GEOAPIFY_API_KEY:'synthetic-private-key',LOCATION_SEARCH_RATE_LIMIT:allow,LOCATION_SEARCH_USAGE_LIMIT:allow,LOCATION_SEARCH_BUDGET:budget};
const row={formatted:'F-10 Markaz, Islamabad, Pakistan',address_line2:'Islamabad, Pakistan',lat:33.695,lon:73.01,country_code:'pk'};
test('query spelling refinements preserve explicit places and only remove city suffixes for sector/phase searches',()=>{
  for(const [query,expected] of [
    ['F-10 Markaz Islamabad','F-10 Markaz'],['G13, Islamabad','G13'],['G13,Islamabad','G13'],
    ['DHA Phase II Islamabad','DHA Phase 2'],['Bahria Town Phase VII Rawalpindi','Bahria Town Phase 7'],
    ['US Embassy Islamabad','United States Embassy Islamabad'],['U.S. Embassy Islamabad','United States Embassy Islamabad'],
    ['US Embassy','United States Embassy'],['United States Embassy Islamabad','United States Embassy Islamabad'],
    ['Rawalpindi Saddar','Rawalpindi Saddar'],['Centaurus Islamabad','Centaurus Islamabad'],
    ['Islamabad F-10 Markaz','Islamabad F-10 Markaz'],['F-10 Rawalpindi Road','F-10 Rawalpindi Road'],
    ['Phase LIV Islamabad','Phase LIV Islamabad']
  ])assert.equal(normalizePlaceQuery(query),expected,query);
});
test('explicit sector/subsector and phase identities never accept fuzzy substitutes',()=>{
  for(const [query,candidate,expected] of [
    ['F-10 Markaz','Street 10, I-8 Markaz Ground, Islamabad',false],
    ['F10 Markaz','G-10 Markaz, Islamabad',false],['F 10 Markaz','F-10 Markaz, Islamabad',true],
    ['G-13 Islamabad','G-13/1, Islamabad',true],['G13','G-1/3, Islamabad',false],
    ['G-13/2','G-13/1, Islamabad',false],['G-13/2','G-13/2, Islamabad',true],
    ['F-1','F-10 Islamabad',false],['Bahria Town Phase 7','Street 7, Bahria Town Phase 4',false],
    ['Bahria Town Phase VII','Globe Junction, Bahria Town Phase 7',true],
    ['Bahria Town Phase 7','DHA Phase 7',false],['DHA Phase II','Bahria Town Phase 2',false],
    ['DHA Phase II','Defence Housing Authority Phase 2',true],
    ['US Embassy Islamabad','Embassy of Ukraine, Islamabad',false],
    ['U.S. Embassy Islamabad','Embassy of the United States, Islamabad',true],
    ['Centaurus Islamabad','The Centaurus, Islamabad',true]
  ] as const)assert.equal(matchesRequestedPlace(query,candidate),expected,query+' -> '+candidate);
});
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
test('measured Saddar and Centaurus names rank before incidental address and business matches without inventing results',async()=>{
  const names=['Rawalpindi, Railway Road, Pakistan','Suzuki Jan Motors, Saddar Rawalpindi, Bank Road, Pakistan','Saddar, Rawalpindi, Pakistan'];
  const mock=async()=>Response.json({results:names.map(formatted=>({...row,formatted}))});
  const results=await searchLocalPlaces('Saddar Rawalpindi',env.GEOAPIFY_API_KEY,mock);
  assert.deepEqual(results.map(r=>r.label),[names[2],names[1],names[0]]);
  const centaurus=['Movenpick Hotel Centaurus Islamabad, F-8, Pakistan','Centaurus, F-8, Islamabad, Pakistan','The Centaurus Mall, Islamabad, Pakistan'];
  const ranked=await searchLocalPlaces('Centaurus Islamabad',env.GEOAPIFY_API_KEY,async()=>Response.json({results:centaurus.map(formatted=>({...row,formatted}))}));
  assert.equal(ranked[0].label,centaurus[1]);assert.equal(ranked.length,centaurus.length);
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

test('search reserves budget once after validation and edge checks; refusals and provider failures never refund or retry',async()=>{
  let reservations=0,providers=0;
  const counted={idFromName:(name:string)=>{assert.equal(name,'search-v1');return 0;},get:()=>({fetch:async()=>{reservations++;return Response.json({success:true});}})};
  const configured={...env,LOCATION_SEARCH_BUDGET:counted};
  const provider=async()=>{providers++;assert.equal(reservations,providers);return Response.json({results:[row]});};
  for(const incomplete of [{...configured,LOCATION_SEARCH_BUDGET:undefined},{...configured,APEX_LOCATION_SEARCH_DISABLED:'true'}])
    assert.equal((await placeSearchRoute(post({query:'F-10'}),incomplete,provider)).status,503);
  assert.equal((await placeSearchRoute(post({query:'ab'}),configured,provider)).status,400);
  assert.equal((await placeSearchRoute(post({query:'F-10'}),{...configured,LOCATION_SEARCH_USAGE_LIMIT:{limit:async()=>({success:false})}},provider)).status,429);
  const noIp=post({query:'F-10'});noIp.headers.delete('cf-connecting-ip');
  assert.equal((await placeSearchRoute(noIp,configured,provider)).status,503);
  assert.equal(reservations,0);assert.equal(providers,0);
  assert.equal((await placeSearchRoute(post({query:'F-10'}),configured,provider)).status,200);
  assert.equal(reservations,1);assert.equal(providers,1);
  assert.equal((await placeSearchRoute(post({query:'F-10'}),configured,async()=>{providers++;throw new Error('provider failure');})).status,503);
  assert.equal(reservations,2);assert.equal(providers,2);
  for(const response of [Response.json({success:false}),Response.json({success:'true'}),Response.json({success:true,extra:'private'}),new Response('bad'),new Response('private',{status:503})]){
    const failed={idFromName:()=>0,get:()=>({fetch:async()=>response})};
    assert.equal((await placeSearchRoute(post({query:'F-10'}),{...env,LOCATION_SEARCH_BUDGET:failed},provider)).status,503);
  }
  const throwing={idFromName:()=>0,get:()=>({fetch:async()=>{throw new Error('private budget failure');}})};
  const refused=await placeSearchRoute(post({query:'F-10'}),{...env,LOCATION_SEARCH_BUDGET:throwing},provider);
  assert.equal(refused.status,503);assert.doesNotMatch(await refused.text(),/private budget/);
  assert.equal(providers,2);
});
