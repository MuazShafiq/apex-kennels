import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGooglePlacePin,resolveSharedGoogleMapsPin} from './shared-map-pin.ts';

const exactKennel='https://www.google.com/maps/place/33%C2%B017%2757.2%22N+73%C2%B015%2712.4%22E/@33.2992325,73.2508812,17z/data=!3m1!4b1!4m4!3m3!8m2!3d33.2992325!4d73.2534561?hl=en';
const kennel={lat:33.2992325,lon:73.2534561};
const short='https://maps.app.goo.gl/x7KMJZuXFG74HqQg8';

test('extracts actual Google place pin, not the incorrect URL viewport centre',async()=>{
  assert.deepEqual(parseGooglePlacePin(exactKennel),kennel);
  const result=await resolveSharedGoogleMapsPin(exactKennel,{
    fetcher:async()=>{throw new Error('Already exact, no HTTP allowed')}
  });
  assert.equal(result.ok,true);
  if(result.ok){
    assert.deepEqual(result.pin,kennel);
    assert.equal(result.roadEntranceConfirmed,false);
    assert.equal(result.customerConfirmationRequired,true);
    assert.equal(result.verifiedBy,'google_maps_place');
  }
});

test('plain coordinates and ?q lat,lon work without any HTTP requests',async()=>{
  for(const value of [
    '33.2992325,73.2534561',
    'https://maps.google.com/?q=33.2992325%2C73.2534561',
    'https://www.google.com/maps?query=33.2992325%2C73.2534561'
  ]){
    const resolved=await resolveSharedGoogleMapsPin(value,{
      fetcher:async()=>{throw new Error('Unexpected HTTP fetch')}
    });
    assert.equal(resolved.ok,true);
    if(resolved.ok)assert.deepEqual(resolved.pin,kennel);
  }
});

test('rejects map viewport location, vague text address and directions as billable pins',async()=>{
  for(const value of [
    'Street 15, Islamabad, Pakistan',
    'https://www.google.com/maps/@33.2992325,73.2508812,17z',
    'https://www.google.com/maps/dir/33.2992325,73.2534561/33.41,73.13/data=!3d33.41!4d73.13',
    'https://www.google.com/maps/place/Bawli+Restaurant',
  ]){
    const resolved=await resolveSharedGoogleMapsPin(value,{
      fetcher:async()=>{throw new Error('Should reject without HTTP')}
    });
    assert.equal(resolved.ok,false,value);
  }
});

test('follows only allowlisted HTTPS short-link redirects, never scrapes map HTML',async()=>{
  const calls:string[]=[];
  const result=await resolveSharedGoogleMapsPin(short,{fetcher:async(input,init)=>{
    calls.push(String(input));
    assert.equal(init?.redirect,'manual');
    return new Response(null,{
      status:302,headers:{location:exactKennel}
    });
  }});
  assert.equal(result.ok,true);
  if(result.ok){
    assert.deepEqual(result.pin,kennel);
    assert.equal(result.roadEntranceConfirmed,false);
  }
  assert.deepEqual(calls,[short]);
});

test('safe two-hop Maps short redirect still stops at exact marker',async()=>{
  const urls:string[]=[];
  const result=await resolveSharedGoogleMapsPin(short,{
    fetcher:async(input)=>{
      const url=String(input);urls.push(url);
      return new Response(null,{status:302,headers:{
        location:urls.length===1?'https://maps.app.goo.gl/next123':exactKennel
      }});
    }
  });
  assert.equal(result.ok,true);
  assert.equal(urls.length,2);
});

test('SSRF and unsafe redirects fail closed; never request attacker/private hosts',async()=>{
  let calls=0;
  const blocked=[
    'http://maps.app.goo.gl/example',
    'https://maps.app.goo.gl.evil.test/abc',
    'http://127.0.0.1:8000/private',
    'https://example.test/?q=33.2992325,73.2534561',
    'https://user:pass@maps.app.goo.gl/abc',
    'https://maps.app.goo.gl:8443/x7KMJZuXFG74HqQg8',
  ];
  for(const value of blocked){
    const r=await resolveSharedGoogleMapsPin(value,{
      fetcher:async()=>{calls++;return new Response('{}')}
    });
    assert.equal(r.ok,false,value);
  }
  assert.equal(calls,0);
  for(const target of [
    'https://evil.example/private',
    'http://www.google.com/maps?q=33.3,73.2',
    'http://127.0.0.1:8787/secrets',
    'file:///etc/passwd',
    'https://maps.google.com.evil.test/?q=33.3,73.2'
  ]){
    const r=await resolveSharedGoogleMapsPin(short,{fetcher:async()=>new Response(null,{
      status:302,headers:{location:target}
    })});
    assert.equal(r.ok,false,target);
  }
});

test('dead, cyclic, nonsensical share links fail without inventing coordinates',async()=>{
  const missing=await resolveSharedGoogleMapsPin(short,{
    fetcher:async()=>new Response('No route',{status:404})
  });
  assert.equal(missing.ok,false);
  let calls=0;
  const cyclic=await resolveSharedGoogleMapsPin(short,{maxRedirects:2,fetcher:async()=>{
    calls++;
    return new Response(null,{status:302,headers:{location:short}});
  }});
  assert.equal(cyclic.ok,false);
  assert.equal(calls,2);
  const invalid=await resolveSharedGoogleMapsPin(short,{
    fetcher:async()=>{throw new Error('Network unavailable')}
  });
  assert.equal(invalid.ok,false);
});

test('bounds input length and excludes control characters',async()=>{
  for(const value of ['a'.repeat(2500),short+'\n',short+'\0']){
    const r=await resolveSharedGoogleMapsPin(value);
    assert.equal(r.ok,false);
  }
});
