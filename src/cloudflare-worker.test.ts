import test from 'node:test';
import assert from 'node:assert/strict';
import {handleWorkerRequest, type WorkerEnv} from './cloudflare-worker.ts';
import type {SaveIntake} from './cloudflare-worker.ts';

const secret = 'synthetic-dev-secret-that-is-not-real-2026';
const env: WorkerEnv = {DATABASE_URL:'postgresql://fake.invalid/demodb',INTAKE_API_SECRET:secret};
const payload = {
  source:'google_form',
  externalResponseId:'fixture-001',
  customerName:'Fixture Owner',
  phone:'03000000000',
  petName:'Fixture Pet',
  startDate:'2026-12-01',
  endDate:'2026-12-03',
};
const endpoint = 'https://example.workers.dev/api/ingest';

function makeRequest(data: unknown = payload, token: string = secret): Request {
  return new Request(endpoint, {
    method:'POST',
    headers:{'Authorization':'Bearer ' + token,'Content-Type':'application/json'},
    body:JSON.stringify(data),
  });
}

test('health works without credentials and reports no database data',async()=>{
  const response=await handleWorkerRequest(new Request('https://example.workers.dev/api/health'),{});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{status:'ok',service:'apex-intake'});
  assert.equal(response.headers.get('cache-control'),'no-store');
});

test('unrecognized routes and methods are blocked',async()=>{
  const unknown=await handleWorkerRequest(new Request('https://example.workers.dev/not-found'),{});
  assert.equal(unknown.status,404);
  const get=await handleWorkerRequest(new Request(endpoint),env);
  assert.equal(get.status,405);
});

test('ingestion is closed without runtime secrets',async()=>{
  const res=await handleWorkerRequest(makeRequest(),{});
  assert.equal(res.status,503);
});

test('wrong bearer token is rejected before accessing database',async()=>{
  let called=false;
  const fake:SaveIntake=async()=>{called=true;return {bookingId:'id',created:true,status:'requested'};};
  const response=await handleWorkerRequest(makeRequest(payload,'wrong-token'),env,fake);
  assert.equal(response.status,401);
  assert.equal(called,false);
});

test('valid submitted booking is passed to database transaction helper',async()=>{
  let called=false;
  const fake:SaveIntake=async(_dbUrl,input)=>{
    called=true;
    assert.equal(input.externalResponseId,'fixture-001');
    assert.equal(input.source,'google_form');
    return {bookingId:'synthetic-booking-id',created:true,status:'requested'};
  };
  const response=await handleWorkerRequest(makeRequest(),env,fake);
  assert.equal(response.status,201);
  assert.equal(called,true);
  assert.equal((await response.json() as {bookingId:string}).bookingId,'synthetic-booking-id');
});

test('same submission returned from persistence is HTTP 200',async()=>{
  const fake:SaveIntake=async()=>({bookingId:'existing-id',created:false,status:'reviewing'});
  assert.equal((await handleWorkerRequest(makeRequest(),env,fake)).status,200);
});

test('bad JSON, overly large body and wrong content type rejected',async()=>{
  const malformed = new Request(endpoint,{method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},body:'{'});
  assert.equal((await handleWorkerRequest(malformed,env)).status,400);
  const huge = makeRequest({...payload,customerName:'X'.repeat(20_000)});
  assert.equal((await handleWorkerRequest(huge,env)).status,413);
  const wrong = new Request(endpoint,{method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'text/plain'},body:'hi'});
  assert.equal((await handleWorkerRequest(wrong,env)).status,415);
});

test('database errors do not reveal internal details',async()=>{
  const fake:SaveIntake=async()=>{throw new Error('DATABASE_URL and sensitive details')};
  const response=await handleWorkerRequest(makeRequest(),env,fake);
  assert.equal(response.status,500);
  assert.deepEqual(await response.json(),{error:'Internal server error'});
});

test('public rate card exposes only boarding rates and revalidates on a change',async()=>{
  const url='https://example.workers.dev/api/rate-card/current';
  const current={...env,APEX_RATE_CARDS_ENABLED:'true'};
  let version=3;
  const times:(string|null)[]=[];
  const deps:Parameters<typeof handleWorkerRequest>[3]={readRateCard:async(_db,at=null)=>{
    times.push(at);
    return {version,effectiveFrom:'2026-11-01T00:00:00+05:00',stdDaily:2500,cameraDaily:3000,
      packageDiscount:10000,packageDays:30,fuelMode:'fixed',fixedFuelPkr:350,fixedUntil:'2026-11-30',
      fixedReason:'Internal fuel reason',kmPerLitre:12,markupPct:20,freshnessHours:24,
      createdBy:'owner@example.test',createdAt:'2026-11-01T00:00:00+05:00',summary:'Internal summary'};
  }};
  const disabled=await handleWorkerRequest(new Request(url),env,undefined,deps);
  assert.equal(disabled.status,503);
  for(const query of ['?bad=1','?at=','?at=2026-02-30T00:00:00Z','?at=2026-11-28T24:00:00Z','?at=a&at=a']){
    const invalid=await handleWorkerRequest(new Request(url+query),current,undefined,deps);
    assert.equal(invalid.status,400);
  }
  assert.deepEqual(times,[]);
  const request=new Request(url+'?at=2026-11-28T12:00:00%2B05:00');
  const response=await handleWorkerRequest(request,current,undefined,deps);
  assert.deepEqual(times,['2026-11-28T07:00:00.000Z']);
  assert.deepEqual(await response.json(),{version:3,effectiveFrom:'2026-10-31T19:00:00.000Z',
    stdDaily:2500,cameraDaily:3000,packageDays:30,packageDiscount:10000});
  assert.equal(response.headers.get('Cache-Control'),'private, no-cache');
  const revalidate=()=>handleWorkerRequest(new Request(url,{headers:{'If-None-Match':response.headers.get('ETag')!}}),current,undefined,deps);
  assert.equal((await revalidate()).status,304);
  version=4;
  assert.equal((await revalidate()).status,200);
  assert.deepEqual(times,['2026-11-28T07:00:00.000Z',null,null]);
});
