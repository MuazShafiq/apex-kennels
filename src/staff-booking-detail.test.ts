import test from 'node:test';
import assert from 'node:assert/strict';
import {handleWorkerRequest,type WorkerEnv,type StaffContext,type StaffDetailReader} from './cloudflare-worker.ts';
import {parseStaffBookingId,renderStaffBookingDetail,type StaffBookingDetail} from './staff-booking-detail.ts';

const origin='https://example.workers.dev';
const id='123e4567-e89b-42d3-a456-426614174001';
const url=origin+'/staff/booking?id='+id;
const env:WorkerEnv={
  DATABASE_URL:'postgresql://synthetic.invalid/demo',
  STAFF_ACCESS_AUD:'test-audience',
  STAFF_ALLOWED_EMAILS:'staff@example.test'
};
const staff:StaffContext={access:{aud:'test-audience',getIdentity:async()=>({email:'STAFF@example.test'})}};
const detail:StaffBookingDetail={
  id,status:'requested',createdAt:'2026-11-06 10:00:00+00',startDate:'2026-12-01',endDate:'2026-12-03',
  customerName:'<img src=x onerror=alert(1)>',
  email:'tester@example.test',phone:'03000000000',
  accommodationType:null,pets:[{name:'Rover & <script>alert(2)</script>',breed:'Labrador'}],
  isSynthetic:false,hasFormDetails:true,
  ownerAddress:'Address <script>danger</script>',pickupDropoffRequested:true,cameraCageRequested:false,
  emergencyContactPhone:'03001111111',petGender:'Male',petAgeDescription:'2 years',
  vaccinationStatus:'Fully vaccinated and booster is up to date',distemperHistory:'Not Sure',
  veterinarianPhone:null,personalityTraits:{biteHistory:true,friendly:false},
  specialInstructions:'No visitors <script>alert(1)</script>',
  medicationFeedingInstructions:'Twice daily & food',
  termsAccepted:true
};
const one:StaffDetailReader=async(_url,bookingId)=>{
  assert.equal(bookingId,id);
  return detail;
};

test('private booking details show essential animal-care answers, escaped and no-store',async()=>{
  const response=await handleWorkerRequest(new Request(url),env,undefined,{context:staff,detail:one});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.match(response.headers.get('content-security-policy')??'',/default-src 'none'/);
  const html=await response.text();
  assert.match(html,/Booking details/);
  assert.match(html,/Vaccination status/);
  assert.match(html,/Emergency contact/);
  assert.match(html,/Medication and feeding/);
  assert.match(html,/Bite history/);
  assert.match(html,/Bite history: <strong>Yes<\/strong>/);
  assert.match(html,/Friendly: <strong>No<\/strong>/);
  assert.match(html,/Canine distemper history/);
  assert.match(html,/Review price estimate/);
  assert.match(html,/Rover &amp; &lt;script&gt;/);
  assert.match(html,/&lt;img/);
  assert.match(html,/Address &lt;script&gt;/);
  assert.doesNotMatch(html,/<script|<img/);
  assert.doesNotMatch(html,/Send invoice|Mark paid|Approve booking/);
});

test('missing Form details are not invented',()=>{
  const html=renderStaffBookingDetail({...detail,hasFormDetails:false,
    medicationFeedingInstructions:null,personalityTraits:null});
  assert.match(html,/Full boarding details are missing/);
  assert.doesNotMatch(html,/Twice daily/);
});

test('booking detail route is denied before touching database if not staff',async()=>{
  let calls=0;
  const read:StaffDetailReader=async()=>{calls++;return detail;};
  const disabled=await handleWorkerRequest(new Request(url),{},undefined,{detail:read});
  assert.equal(disabled.status,503);
  const spoofed=await handleWorkerRequest(new Request(url,{
    headers:{'Cf-Access-Jwt-Assertion':'forged'}
  }),env,undefined,{detail:read});
  assert.equal(spoofed.status,403);
  const denied=await handleWorkerRequest(new Request(url),env,undefined,{
    context:{access:{aud:'test-audience',getIdentity:async()=>({email:'other@example.test'})}},
    detail:read
  });
  assert.equal(denied.status,403);
  const wrongAudience=await handleWorkerRequest(new Request(url),env,undefined,{
    context:{access:{aud:'wrong-audience',getIdentity:async()=>({email:'staff@example.test'})}},
    detail:read
  });
  assert.equal(wrongAudience.status,403);
  assert.equal(calls,0);
});

test('strict UUID validation before query, no writes, safe missing and failure responses',async()=>{
  let calls=0;
  const read:StaffDetailReader=async()=>{calls++;return null;};
  for(const suffix of ['', '?id=1%27OR1%3D1', '?id=not-a-uuid']){
    const response=await handleWorkerRequest(new Request(origin+'/staff/booking'+suffix),env,
      undefined,{context:staff,detail:read});
    assert.equal(response.status,400);
  }
  assert.equal(calls,0);
  assert.throws(()=>parseStaffBookingId(new URL(origin+'/staff/booking?id=hack')));
  const notFound=await handleWorkerRequest(new Request(url),env,undefined,{context:staff,detail:read});
  assert.equal(notFound.status,404);
  assert.equal(calls,1);
  const bad=await handleWorkerRequest(new Request(url),env,undefined,{
    context:staff,detail:async()=>{throw new Error('DATABASE_URL secret')}
  });
  assert.equal(bad.status,500);
  assert.deepEqual(await bad.json(),{error:'Internal server error'});
  const post=await handleWorkerRequest(new Request(url,{method:'POST'}),env,undefined,{context:staff,detail:read});
  assert.equal(post.status,405);
});

test('public demo never links to private booking records',async()=>{
  const demo=await handleWorkerRequest(new Request(origin+'/demo/staff'),{});
  const html=await demo.text();
  assert.equal(demo.status,200);
  assert.doesNotMatch(html,/\/staff\/booking\?id=/);
  assert.doesNotMatch(html,/03000000000/);
});

test('synthetic booking remains marked as fake, not contactable',()=>{
  const html=renderStaffBookingDetail({...detail,isSynthetic:true});
  assert.match(html,/TEST RECORD/);
  assert.match(html,/DO NOT CONTACT/);
});

test('customer-confirmed pickup pin appears only in staff booking details, not in the public demo',()=>{
  const withPin=renderStaffBookingDetail({...detail,transportLocation:{
    latitude:33.7123,longitude:73.1076,service:'both',customerConfirmed:true
  }});
  assert.match(withPin,/Pickup \/ drop-off location/);
  assert.match(withPin,/Customer-selected pin/);
  assert.doesNotMatch(withPin,/Confirmed by customer/);
  assert.match(withPin,/33\.712300, 73\.107600/);
  assert.match(withPin,/Open in Google Maps/);
  assert.match(withPin,/Check road access/);
  const noPin=renderStaffBookingDetail({...detail,transportLocation:null});
  assert.doesNotMatch(noPin,/Open in Google Maps/);
});
