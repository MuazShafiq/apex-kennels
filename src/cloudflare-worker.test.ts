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
