import test from 'node:test';
import assert from 'node:assert/strict';
import {searchTomTomPlaces,suggestTomTomPlaces,resolveTomTomPlace,normalizeTomTomQuery,TomTomPlacesError,matchesPlaceQuery} from './tomtom-places.ts';
import {handleWorkerRequest,type WorkerEnv} from './cloudflare-worker.ts';

const url='https://example.workers.dev/api/book/places?q=US%20Embassy';
const key='synthetic-tomtom-test-api-key';
const env:WorkerEnv={TOMTOM_API_KEY:key,GEOAPIFY_API_KEY:'synthetic-geoapify-key'};

test('TomTom Discover sends a bounded, biased Pakistan POI search and returns coordinates',async()=>{
  const fetcher:typeof fetch=async(input,options)=>{
    assert.equal(String(input),'https://api.tomtom.com/maps/orbis/places/discover');
    assert.equal(options?.method,'POST');
    assert.equal(options?.redirect,'manual');
    assert.equal(new Headers(options?.headers).get('TomTom-Api-Key'),key);
    assert.equal(new Headers(options?.headers).get('TomTom-Api-Version'),'3');
    const body=JSON.parse(String(options?.body));
    assert.equal(body.query,'US Embassy');
    assert.equal(body.maxResults,5);
    assert.deepEqual(body.filters.countryCodesIso2,['PK']);
    assert.ok(body.filters.types.includes('poi'));
    assert.deepEqual(body.preferences.geometry.coordinates,[73.0479,33.6844]);
    return new Response(JSON.stringify({results:[
      {id:'poi-1',type:'poi',title:'US Embassy Islamabad',
        subtitles:['Diplomatic Enclave','Islamabad'],
        position:{type:'Point',coordinates:[73.126,33.731]},
        address:{countryCodeIso2:'PK'}},
      {id:'poi-2',type:'poi',title:'Another nearby place',
        position:{type:'Point',coordinates:[73.12,33.73]},
        address:{countryCodeIso2:'PK'}},
      {id:'nonpk',type:'poi',title:'USA',
        position:{type:'Point',coordinates:[73.1,33.7]},
        address:{countryCodeIso2:'US'}},
      {id:'no-position',type:'discoverAction',title:'Embassies'},
      {id:'dup',type:'poi',title:'Duplicate',position:{type:'Point',coordinates:[73.126,33.731]}}
    ]}),{status:200});
  };
  assert.deepEqual(await searchTomTomPlaces('US Embassy',key,fetcher),[
    {label:'US Embassy Islamabad, Diplomatic Enclave, Islamabad',latitude:33.731,longitude:73.126},
    {label:'Another nearby place',latitude:33.73,longitude:73.12}
  ]);
});
test('invalid key, empty result, quota limit or provider error never invent a location',async()=>{
  await assert.rejects(()=>searchTomTomPlaces('Embassy','',async()=>new Response('{}')));
  await assert.rejects(()=>searchTomTomPlaces('Embassy',key,async()=>new Response('{}',{status:429})));
  await assert.rejects(()=>searchTomTomPlaces('Embassy',key,async()=>new Response('<html>bad gateway</html>',{status:200})));
  assert.deepEqual(await searchTomTomPlaces('Embassy',key,async()=>new Response(JSON.stringify({results:[]}),{status:200})),[]);
});
test('new Worker search switches to TomTom when configured, leaves Geoapify as fallback',async()=>{
  const withTomTom=await handleWorkerRequest(new Request(url),env,undefined,{
    suggestPlaces:async(query,secret)=>{
      assert.equal(query,'US Embassy');
      assert.equal(secret,key);
      return [{label:'Synthetic Embassy',placeId:'synthetic',placeType:'pois'}];
    }
  });
  assert.equal(withTomTom.status,200);
  assert.equal((await withTomTom.json() as {attribution:string}).attribution,'TomTom');
  const fallback=await handleWorkerRequest(new Request(url),{GEOAPIFY_API_KEY:'synthetic-geoapify-key'},undefined,{
    searchPlaces:async(_q,secret)=>{
      assert.equal(secret,'synthetic-geoapify-key');return [];
    }
  });
  assert.equal(fallback.status,200);
  assert.match((await fallback.json() as {attribution:string}).attribution,/Geoapify/);
});

test('as-you-type Suggest uses TomTom purpose-built API with normalised U.S. abbreviation',async()=>{
  assert.equal(normalizeTomTomQuery('  U.S. Embassy  '),'US Embassy');
  assert.equal(normalizeTomTomQuery('U.S Embassy'),'US Embassy');
  const places=await suggestTomTomPlaces('U.S. Embassy',key,async(url,init)=>{
    assert.equal(String(url),'https://api.tomtom.com/maps/orbis/places/suggest');
    assert.equal(init?.redirect,'manual');
    const body=JSON.parse(String(init?.body));
    assert.equal(body.query,'US Embassy');
    assert.equal(body.maxResults,10);
    assert.deepEqual(body.filters.countryCodesIso2,['PK']);
    assert.deepEqual(body.filters.geometry,{type:'rectangle',coordinates:[72.81,33.43,73.30,33.84]});
    assert.equal(new Headers(init?.headers).get('Attributes'),'results(id,type,title,subtitles,address.countryCodeIso2)');
    return new Response(JSON.stringify({results:[
      {type:'poi',id:'EmbassyId_01',title:'Embassy of the United States',subtitles:['Islamabad','Diplomatic Enclave']},
      {type:'address',id:'Addr02',title:'US Embassy Road, Sector G-5'},
      {type:'poi',id:'Kashmir01',title:'US Embassy Jammu',subtitles:['Kashmir'],address:{countryCodeIso2:'IN'}},
      {type:'poi',id:'Rayaz01',title:'Rayaz Sayeed House',subtitles:['Jammu & Kashmir']}, 
      {type:'discoverAction',title:'Embassies',id:'not-a-place'},
      {type:'poi',id:'../../unsafe',title:'Unsafe'}
    ]}),{status:200});
  });
  assert.deepEqual(places,[
    {label:'Embassy of the United States, Islamabad, Diplomatic Enclave',placeId:'EmbassyId_01',placeType:'pois'},
    {label:'US Embassy Road, Sector G-5',placeId:'Addr02',placeType:'addresses'}
  ]);
});
test('Details loads accurate coordinates only when the user selects a place',async()=>{
  const place=await resolveTomTomPlace('pois','EmbassyId_01',key,async(url,init)=>{
    assert.equal(String(url),'https://api.tomtom.com/maps/orbis/places/details/pois/EmbassyId_01');
    assert.equal(init?.method,'GET');
    assert.equal(init?.redirect,'manual');
    return new Response(JSON.stringify({
      id:'EmbassyId_01',type:'poi',title:'US Embassy Islamabad',
      position:{type:'Point',coordinates:[73.126,33.731]},
      address:{countryCodeIso2:'PK'}
    }),{status:200});
  });
  assert.deepEqual(place,{label:'US Embassy Islamabad',latitude:33.731,longitude:73.126});
  await assert.rejects(()=>resolveTomTomPlace('pois','../bad',key,async()=>new Response('{}')));
  await assert.rejects(()=>resolveTomTomPlace('pois','GoodId',key,async()=>new Response(JSON.stringify({
    title:'Outside Pakistan',position:{type:'Point',coordinates:[-73.9,40.7]},address:{countryCodeIso2:'US'}
  }))));
});
test('upstream TomTom 429 reaches the browser as rate limited without disclosing the key',async()=>{
  await assert.rejects(
    ()=>suggestTomTomPlaces('US Embassy',key,async()=>new Response('{}',{status:429})),
    (e:unknown)=>e instanceof TomTomPlacesError&&e.status===429
  );
  const response=await handleWorkerRequest(new Request(url),env,undefined,{
    suggestPlaces:async()=>{throw new TomTomPlacesError(429);}
  });
  assert.equal(response.status,429);
  assert.equal(response.headers.get('retry-after'),'2');
  const data=await response.json() as {code:string;error:string};
  assert.equal(data.code,'RATE_LIMITED');
  assert.doesNotMatch(JSON.stringify(data),/synthetic-tomtom-test-api-key/);
});
test('place details endpoint validates allowlisted place IDs and never exposes server key',async()=>{
  const host='https://example.workers.dev';
  const invalid=await handleWorkerRequest(new Request(host+'/api/book/place?type=pois&id=../something'),env);
  assert.equal(invalid.status,400);
  const selected=await handleWorkerRequest(new Request(host+'/api/book/place?type=pois&id=GoodId'),env,undefined,{
    resolvePlace:async(type,id,secret)=>{
      assert.equal(type,'pois');assert.equal(id,'GoodId');assert.equal(secret,key);
      return {label:'Actual selected place',latitude:33.73,longitude:73.12};
    }
  });
  assert.equal(selected.status,200);
  assert.deepEqual(await selected.json(),{place:{label:'Actual selected place',latitude:33.73,longitude:73.12}});
});

test('only meaningful name matches are eligible in local search',()=>{
  assert.equal(matchesPlaceQuery('Raya','Rayaz Sayeed House, Jammu & Kashmir'),false);
  assert.equal(matchesPlaceQuery('Raya','Raya Fairways, DHA Phase 6 Lahore'),true);
  assert.equal(matchesPlaceQuery('US Embassy','Embassy of the United States, Islamabad'),true);
  assert.equal(matchesPlaceQuery('US Embassy','Attaturk Avenue, G-5, Islamabad'),false);
});
test('resolved places outside Islamabad–Rawalpindi are rejected even if provider suggests them',async()=>{
  await assert.rejects(
    ()=>resolveTomTomPlace('pois','LahoreId',key,async()=>new Response(JSON.stringify({
      id:'LahoreId',title:'Raya Fairways',position:{type:'Point',coordinates:[74.40,31.48]},
      address:{countryCodeIso2:'PK'}
    }),{status:200})),
    (error:unknown)=>error instanceof TomTomPlacesError&&error.status===422
  );
  const lookup=await handleWorkerRequest(
    new Request('https://example.workers.dev/api/book/place?type=pois&id=LahoreId'),env,undefined,{
      resolvePlace:async()=>({label:'Lahore place',latitude:31.48,longitude:74.40})
    });
  assert.equal(lookup.status,422);
  assert.equal((await lookup.json() as {code:string}).code,'OUT_OF_SERVICE_AREA');
});
