import test from 'node:test';
import assert from 'node:assert/strict';
import {searchTomTomPlaces} from './tomtom-places.ts';
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
    searchPlaces:async(query,secret)=>{
      assert.equal(query,'US Embassy');
      assert.equal(secret,key);
      return [{label:'Synthetic Embassy',latitude:33.7,longitude:73.1}];
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
