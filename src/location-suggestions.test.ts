import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {handleWorkerRequest,type WorkerEnv} from './cloudflare-worker.ts';
import {parsePlaceQuery,searchPakistaniPlaces} from './location-suggestions.ts';

const origin='https://example.workers.dev';
const env:WorkerEnv={GEOAPIFY_API_KEY:'synthetic-geocoding-key'};
const exampleResults={
  results:[
    {country_code:'pk',formatted:'Bahria Town, Rawalpindi, Pakistan',lat:33.529,lon:73.108},
    {country_code:'pk',formatted:'Gulberg Greens, Islamabad, Pakistan',lat:33.606,lon:73.207},
    {country_code:'us',formatted:'Springfield, USA',lat:33.6,lon:73.2},
    {country_code:'pk',formatted:'Outside',lat:51,lon:73.2},
    {country_code:'pk',formatted:'Bahria Town duplicate',lat:33.529,lon:73.108}
  ]
};
test('Geoapify autocomplete is constrained to Pakistan and returns safe, deduplicated suggestions',async()=>{
  const fetcher:typeof fetch=async(url,options)=>{
    const u=new URL(String(url));
    assert.equal(u.origin,'https://api.geoapify.com');
    assert.equal(u.pathname,'/v1/geocode/autocomplete');
    assert.equal(u.searchParams.get('text'),'Bahria');
    assert.equal(u.searchParams.get('filter'),'countrycode:pk');
    assert.equal(u.searchParams.get('limit'),'5');
    assert.equal(u.searchParams.get('apiKey'),env.GEOAPIFY_API_KEY);
    assert.equal(options?.redirect,'error');
    return new Response(JSON.stringify(exampleResults),{status:200});
  };
  const places=await searchPakistaniPlaces('Bahria',env.GEOAPIFY_API_KEY!,fetcher);
  assert.deepEqual(places,[
    {label:'Bahria Town, Rawalpindi, Pakistan',latitude:33.529,longitude:73.108},
    {label:'Gulberg Greens, Islamabad, Pakistan',latitude:33.606,longitude:73.207}
  ]);
});

test('search proxy is read-only, disabled without key and does not leak credentials',async()=>{
  const path=origin+'/api/book/places?q=Bahria';
  const disabled=await handleWorkerRequest(new Request(path),{});
  assert.equal(disabled.status,503);
  assert.doesNotMatch(await disabled.text(),/synthetic-geocoding-key/);
  const ok=await handleWorkerRequest(new Request(path),env,undefined,{
    searchPlaces:async(q,k)=>{
      assert.equal(q,'Bahria');assert.equal(k,'synthetic-geocoding-key');
      return [{label:'Sample address, Pakistan',latitude:33.5,longitude:73.1}];
    }
  });
  assert.equal(ok.status,200);
  assert.equal(ok.headers.get('cache-control'),'no-store');
  assert.deepEqual((await ok.json()).items,[{label:'Sample address, Pakistan',latitude:33.5,longitude:73.1}]);
  const post=await handleWorkerRequest(new Request(path,{method:'POST'}),env);
  assert.equal(post.status,405);
});

test('search validates a single bounded query before any external lookup',async()=>{
  for(const q of ['','aa','x'.repeat(91),'abc&other=x','%00abc']){
    let calls=0;
    const r=await handleWorkerRequest(new Request(origin+'/api/book/places?q='+q),env,undefined,{
      searchPlaces:async()=>{calls++;return[];}
    });
    assert.equal(r.status,400);
    assert.equal(calls,0);
  }
  assert.equal(parsePlaceQuery(new URL(origin+'/api/book/places?q=%20%20Bahria%20%20Town%20')),'Bahria Town');
});

test('customer booking has no duplicate pin confirmation or internal jargon',()=>{
  const html=readFileSync('public/book/index.html','utf8');
  const js=readFileSync('public/book/app.js','utf8');
  assert.doesNotThrow(()=>new Script(js));
  assert.match(html,/id="place-search"/);
  assert.match(html,/id="place-results"/);
  assert.match(html,/Read boarding terms/);
  assert.match(html,/Two meals every day/);
  assert.match(html,/Weekly vet check-ups/);
  assert.match(html,/Rs\. 2,500\/day/);
  assert.match(html,/I hold Apex Kennels and staff completely harmless/);
  const clauses=html.match(/<details class="terms"[\s\S]*?<\/details>/)?.[0]||'';
  assert.equal((clauses.match(/<li>/g)||[]).length,6);
  assert.doesNotMatch(html,/confirm-gate|Camera cage requested\?|What do you need\?|Do you need pickup or drop-off\?/);
  for(const choice of ['none','pickup','dropoff','both']){
    assert.match(html,new RegExp('name="transportChoice" value="'+choice+'"'));
  }
  assert.match(js,/api\/book\/places\?q=/);
  assert.match(js,/400\)/);
  assert.match(js,/customerConfirmed:true/);
  assert.doesNotMatch(js,/gate\.checked|confirm-gate/);
  assert.doesNotMatch(js,/GEOAPIFY_API_KEY|TURNSTILE_SECRET_KEY/);
});
