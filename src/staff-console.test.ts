import test from 'node:test';
import assert from 'node:assert/strict';
import {handleWorkerRequest, type WorkerEnv, type StaffList, type StaffContext} from './cloudflare-worker.ts';
import {parseStaffFilter,type StaffBooking} from './staff-bookings.ts';

const origin='https://example.workers.dev';
const env:WorkerEnv={
  DATABASE_URL:'postgresql://synthetic.invalid/demo',
  STAFF_ACCESS_AUD:'aud-synthetic-test',
  STAFF_ALLOWED_EMAILS:'staff@example.test, second@example.test'
};
const valid:StaffContext={access:{aud:'aud-synthetic-test',getIdentity:async()=>({email:'STAFF@example.test'})}};
const booking:StaffBooking={
  id:'synthetic-id',status:'requested',customerName:'Sample <script>alert(1)</script>',
  petNames:'Demo Dog',email:'sample@example.test',phone:null,startDate:'2026-12-12',
  endDate:'2026-12-15',accommodationType:null,createdAt:'2026-11-04',isSynthetic:true
};
const list:StaffList=async(_url,filter)=>{
  assert.equal(filter.status,'all');
  return [booking];
};

test('synthetic staff demo is explicitly labeled and never calls database',async()=>{
  let queried=false;
  const response=await handleWorkerRequest(new Request(origin+'/demo/staff'),{},undefined,{
    list:async()=>{queried=true;return [booking];}
  });
  assert.equal(response.status,200);
  const body=await response.text();
  assert.match(body,/SYNTHETIC DEMO/);
  assert.match(body,/Sample Owner A/);
  assert.doesNotMatch(body,/Sample <script>/);
  assert.equal(queried,false);
  assert.match(response.headers.get('content-security-policy')||'',/default-src 'none'/);
});

test('staff queue is disabled without staff Access configuration',async()=>{
  const response=await handleWorkerRequest(new Request(origin+'/staff'),{DATABASE_URL:env.DATABASE_URL});
  assert.equal(response.status,503);
});

test('forged Access header is not trusted, no database call',async()=>{
  let queried=false;
  const response=await handleWorkerRequest(new Request(origin+'/staff/api/bookings',{
    headers:{'Cf-Access-Jwt-Assertion':'forged'}
  }),env,undefined,{list:async()=>{queried=true;return[];}});
  assert.equal(response.status,403);
  assert.equal(queried,false);
});

test('wrong Access audience fails authorization',async()=>{
  const context={access:{aud:'wrong-audience',getIdentity:async()=>({email:'staff@example.test'})}};
  const response=await handleWorkerRequest(new Request(origin+'/staff'),env,undefined,{context});
  assert.equal(response.status,403);
});

test('valid audience but nonallowlisted email is denied',async()=>{
  const context={access:{aud:'aud-synthetic-test',getIdentity:async()=>({email:'visitor@example.test'})}};
  const response=await handleWorkerRequest(new Request(origin+'/staff'),env,undefined,{context});
  assert.equal(response.status,403);
});

test('authorized staff can read JSON queue but not alter state',async()=>{
  const response=await handleWorkerRequest(new Request(origin+'/staff/api/bookings'),env,undefined,{context:valid,list});
  assert.equal(response.status,200);
  const body=await response.json() as {items:StaffBooking[];readOnly:boolean};
  assert.equal(body.readOnly,true);
  assert.equal(body.items.length,1);
  assert.equal(body.items[0].status,'requested');
  assert.equal(response.headers.get('cache-control'),'no-store');
  const write=await handleWorkerRequest(new Request(origin+'/staff/api/bookings',{method:'POST'}),env,undefined,{context:valid,list});
  assert.equal(write.status,405);
});

test('staff HTML escapes user-controlled names and values',async()=>{
  const response=await handleWorkerRequest(new Request(origin+'/staff'),env,undefined,{context:valid,list});
  assert.equal(response.status,200);
  const body=await response.text();
  assert.match(body,/Sample &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(body,/<script>/);
  assert.match(body,/Signed in: staff@example.test/);
  assert.match(body,/TEST RECORD/);
});

test('invalid filter rejected and does not reach database',async()=>{
  const response=await handleWorkerRequest(new Request(origin+'/staff?status=pwned'),env,undefined,{context:valid,list});
  assert.equal(response.status,400);
  assert.throws(()=>parseStaffFilter(new URL(origin+'/staff?q='+encodeURIComponent('x'.repeat(81)))));
});

test('staff database failures are redacted',async()=>{
  const failing:StaffList=async()=>{throw new Error('database password leaked')};
  const response=await handleWorkerRequest(new Request(origin+'/staff'),env,undefined,{context:valid,list:failing});
  assert.equal(response.status,500);
  assert.deepEqual(await response.json(),{error:'Internal server error'});
});

test('synthetic staff search and status filters work independently of live data',async()=>{
  const response=await handleWorkerRequest(new Request(origin+'/demo/staff?q=Sample%20Owner%20B&status=reviewing'),{});
  assert.equal(response.status,200);
  const body=await response.text();
  assert.match(body,/Sample Owner B/);
  assert.doesNotMatch(body,/Sample Owner A/);
});
