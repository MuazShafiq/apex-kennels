import type {StaffInvoiceSource} from './staff-invoice-draft.ts';
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


const invoiceBookingId='123e4567-e89b-42d3-a456-426614174001';
const invoiceBooking:StaffInvoiceSource={
  bookingId:invoiceBookingId,customerName:'SYNTHETIC CLIENT',
  petNames:'SYNTHETIC PET',petCount:1,startDate:'2026-12-01',endDate:'2026-12-03',
  status:'requested',cameraCageRequested:false,transportRequested:true,synthetic:true
};

test('public synthetic draft is read-only and never reads Neon',async()=>{
  const response=await handleWorkerRequest(new Request(origin+'/demo/draft'),{},undefined,{
    draft:async()=>{throw new Error('Database must never be read for demo')}
  });
  assert.equal(response.status,200);
  const body=await response.text();
  assert.match(body,/SYNTHETIC DATA/);
  assert.match(body,/NOT PAYABLE/);
  assert.match(body,/transport excluded/);
  assert.doesNotMatch(body,/PK29MPBL|real personal data/);
  const invalid=await handleWorkerRequest(new Request(origin+'/demo/draft?package=fiveyears'),{});
  assert.equal(invalid.status,400);
  const post=await handleWorkerRequest(new Request(origin+'/demo/draft',{method:'POST'}),{});
  assert.equal(post.status,405);
});

test('staff draft is denied before DB access when Access or config is missing',async()=>{
  let calls=0;
  const draft=async()=>{calls++;return invoiceBooking};
  const url=origin+'/staff/draft?id='+invoiceBookingId;
  const blocked=await handleWorkerRequest(new Request(url),{},undefined,{draft});
  assert.equal(blocked.status,503);
  const forged=await handleWorkerRequest(new Request(url,{
    headers:{'Cf-Access-Jwt-Assertion':'FAKE'}
  }),env,undefined,{draft});
  assert.equal(forged.status,403);
  const denied=await handleWorkerRequest(new Request(url),env,undefined,{
    context:{access:{aud:'aud-synthetic-test',getIdentity:async()=>({email:'not-staff@example.test'})}},draft
  });
  assert.equal(denied.status,403);
  assert.equal(calls,0);
});

test('authorized staff can only preview invoice draft; no approval or customer sending',async()=>{
  let calls=0;
  const draft=async (_url:string,id:string)=>{calls++;assert.equal(id,invoiceBookingId);return invoiceBooking;};
  const response=await handleWorkerRequest(
    new Request(origin+'/staff/draft?id='+invoiceBookingId),
    env,undefined,{context:valid,draft}
  );
  assert.equal(response.status,200);
  const body=await response.text();
  assert.match(body,/SYNTHETIC CLIENT/);
  assert.match(body,/PKR 7,500/);
  assert.match(body,/transport excluded/);
  assert.match(body,/NOT PAYABLE/);
  assert.doesNotMatch(body,/Send invoice|Approved PDF|Mark paid/);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(calls,1);
  const post=await handleWorkerRequest(
    new Request(origin+'/staff/draft?id='+invoiceBookingId,{method:'POST'}),
    env,undefined,{context:valid,draft}
  );
  assert.equal(post.status,405);
  assert.equal(calls,1);
});

test('draft rejects bad ID and package before SQL; safe 404 and 500 on missing or failed reads',async()=>{
  let calls=0;
  const draft=async()=>{calls++;return null;};
  for(const query of [
    '?id=nope','?id='+invoiceBookingId+'&package=discount99',
    '?id=1%27%20OR%20true'
  ]){
    const response=await handleWorkerRequest(new Request(origin+'/staff/draft'+query),
      env,undefined,{context:valid,draft});
    assert.equal(response.status,400);
  }
  assert.equal(calls,0);
  const notFound=await handleWorkerRequest(
    new Request(origin+'/staff/draft?id='+invoiceBookingId),
    env,undefined,{context:valid,draft});
  assert.equal(notFound.status,404);
  const fail=await handleWorkerRequest(
    new Request(origin+'/staff/draft?id='+invoiceBookingId),
    env,undefined,{context:valid,draft:async()=>{throw new Error('secret database password')}} );
  assert.equal(fail.status,500);
  assert.deepEqual(await fail.json(),{error:'Internal server error'});
});


test('customer pin checker requires staff Access, does not require or write Neon',async()=>{
  const url=origin+'/staff/location';
  const disabled=await handleWorkerRequest(new Request(url),{});
  assert.equal(disabled.status,503);
  const forged=await handleWorkerRequest(new Request(url,{headers:{
    'Cf-Access-Jwt-Assertion':'made-up'
  }}),env);
  assert.equal(forged.status,403);
  const permitted=await handleWorkerRequest(new Request(url),env,undefined,{
    context:valid,
    resolvePin:async()=>{throw new Error('GET must not resolve remote links')}
  });
  assert.equal(permitted.status,200);
  assert.match(await permitted.text(),/Check a customer location/);
  assert.equal(permitted.headers.get('cache-control'),'private, no-store');
});

test('origin checks block cross-site POST before any customer URL is requested',async()=>{
  let networkCalls=0;
  for(const headers of [
    {'Content-Type':'application/x-www-form-urlencoded',origin:'https://attacker.example.test'},
    {'Content-Type':'application/x-www-form-urlencoded'},
  ]){
    const req=new Request(origin+'/staff/location',{
      method:'POST',headers,body:new URLSearchParams({pinUrl:'https://maps.app.goo.gl/fake'}).toString()
    });
    const response=await handleWorkerRequest(req,env,undefined,{
      context:valid,resolvePin:async()=>{networkCalls++;return {ok:false,reason:'NOT_EXACT_PIN'};}
    });
    assert.equal(response.status,403);
  }
  assert.equal(networkCalls,0);
});

test('valid staff can check a customer-submitted pin, but pin is not persisted or invoiced',async()=>{
  const url=origin+'/staff/location';
  const source='https://maps.app.goo.gl/x7KMJZuXFG74HqQg8';
  const request=new Request(url,{method:'POST',headers:{
    origin,'Content-Type':'application/x-www-form-urlencoded'
  },body:new URLSearchParams({pinUrl:source}).toString()});
  let received='';
  const response=await handleWorkerRequest(request,env,undefined,{
    context:valid,
    resolvePin:async value=>{
      received=value;
      return {
        ok:true,pin:{lat:33.2992325,lon:73.2534561},
        verifiedBy:'google_maps_place',
        customerConfirmationRequired:true,roadEntranceConfirmed:false
      };
    }
  });
  assert.equal(response.status,200);
  assert.equal(received,source);
  const body=await response.text();
  assert.match(body,/33.2992325, 73.2534561/);
  assert.match(body,/NOT confirmed as the property gate/);
  assert.doesNotMatch(body,/x7KMJZuXFG74HqQg8/);
  assert.doesNotMatch(body,/Send invoice|Download invoice/);
});

test('invalid staff location form fails with 400 before Google Maps lookup',async()=>{
  const request=new Request(origin+'/staff/location',{method:'POST',headers:{
    origin,'Content-Type':'application/json'
  },body:JSON.stringify({pinUrl:'https://maps.app.goo.gl/x'})});
  let called=false;
  const r=await handleWorkerRequest(request,env,undefined,{context:valid,
    resolvePin:async()=>{called=true;return {ok:false,reason:'NOT_EXACT_PIN'};}});
  assert.equal(r.status,400);
  assert.equal(called,false);
});

test('external redirect failure gives safe unresolved result, not a fake location',async()=>{
  const req=new Request(origin+'/staff/location',{method:'POST',headers:{
    origin,'Content-Type':'application/x-www-form-urlencoded'
  },body:new URLSearchParams({pinUrl:'https://maps.app.goo.gl/example'}).toString()});
  const response=await handleWorkerRequest(req,env,undefined,{
    context:valid,resolvePin:async()=>({ok:false,reason:'REDIRECT_UNAVAILABLE'})
  });
  assert.equal(response.status,200);
  assert.match(await response.text(),/Could not verify an exact pin/);
});

test('staff booking queue links to Access-gated pin checker; demo does not',async()=>{
  const allowed=await handleWorkerRequest(new Request(origin+'/staff'),env,undefined,{
    context:valid,list
  });
  assert.equal(allowed.status,200);
  assert.match(await allowed.text(),/href="\/staff\/location"/);
  const demo=await handleWorkerRequest(new Request(origin+'/demo/staff'),{});
  assert.equal(demo.status,200);
  assert.doesNotMatch(await demo.text(),/href="\/staff\/location"/);
});
