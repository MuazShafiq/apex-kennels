import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {createHash} from 'node:crypto';
import {handleWorkerRequest,type WorkerEnv} from './cloudflare-worker.ts';
import {parsePublicBookingEnvelope,verifyBookingChallenge} from './public-booking.ts';
import {fingerprintIntake,parseIntake} from './intake.ts';
import {saveBooking,type QueryResult,type DbClient} from './booking-store.ts';

const base='https://example.workers.dev';
const env:WorkerEnv={
  DATABASE_URL:'postgres://synthetic.invalid/example',
  APEX_PUBLIC_BOOKING_ENABLED:'true',
  TURNSTILE_SITE_KEY:'synthetic-site-key',
  TURNSTILE_SECRET_KEY:'synthetic-secret-key'
};
const id='a123e456-789b-4123-a456-426614174001';
const booking={
  source:'website',externalResponseId:id,
  customerName:'Synthetic Owner',phone:'03000000000',petName:'Synthetic Dog',
  startDate:'2026-12-10',endDate:'2026-12-13',
  details:{
    ownerAddress:'Demo Street',pickupDropoffRequested:true,cameraCageRequested:false,
    emergencyContactPhone:'03000000001',breed:'Mixed breed',gender:'Female',age:'2 years',
    vaccinationStatus:'Fully vaccinated and booster is up to date',
    distemperHistory:'No',termsAccepted:true,personalityTraits:{friendly:true,biteHistory:false}
  },
  transportLocation:{latitude:33.7,longitude:73.1,service:'both',customerConfirmed:true}
};
const good={booking,turnstileToken:'synthetic-test-token'};
const request=(body:unknown=good,origin=base)=>new Request(base+'/api/book',{
  method:'POST',headers:{'content-type':'application/json',origin},
  body:JSON.stringify(body)
});

test('source restrictions keep Google Form intake unchanged, including fingerprint compatibility',()=>{
  const legacy=parseIntake({
    source:'google_form',externalResponseId:'stable-google-fixture',
    customerName:'Demo Owner',phone:'03000000000',petName:'Dog',
    startDate:'2026-12-01',endDate:'2026-12-03'
  });
  const digest=createHash('sha256').update(JSON.stringify({
    source:legacy.source,externalResponseId:legacy.externalResponseId,
    customerName:legacy.customerName,email:legacy.email??null,
    phone:legacy.phone??null,petName:legacy.petName,
    startDate:legacy.startDate,endDate:legacy.endDate,
    accommodationType:legacy.accommodationType??null,details:legacy.details??null
  })).digest('hex');
  assert.equal(fingerprintIntake(legacy),digest);
  assert.throws(()=>parseIntake(booking),/Unsupported booking source/);
});

test('public form page is only a preview without write configuration and does not leak secrets',async()=>{
  const asset='<html>private independent preview fixture</html>';
  const res=await handleWorkerRequest(new Request(base+'/book'),{
    ASSETS:{fetch:async()=>new Response(asset,{headers:{'content-type':'text/html'}})}
  });
  assert.equal(res.status,200);
  assert.equal(await res.text(),asset);
  assert.doesNotMatch(res.headers.get('content-security-policy')??'',/tiles\.openfreemap\.org/);
  assert.match(res.headers.get('content-security-policy')??'',/challenges\.cloudflare\.com/);
  const config=await handleWorkerRequest(new Request(base+'/api/book/config'),{
    TURNSTILE_SITE_KEY:'visible-but-not-enabled'
  });
  assert.deepEqual(await config.json(),{enabled:false});
  const blocked=await handleWorkerRequest(request(),{},undefined,{verifyChallenge:async()=>true});
  assert.equal(blocked.status,503);
});

test('public site exposes only the Turnstile site key after explicit enablement',async()=>{
  const res=await handleWorkerRequest(new Request(base+'/api/book/config'),env);
  assert.deepEqual(await res.json(),{enabled:true,siteKey:'synthetic-site-key'});
  const invalid=await handleWorkerRequest(new Request(base+'/api/book/config',{method:'POST'}),env);
  assert.equal(invalid.status,405);
});

test('website booking needs correct origin and real challenge before any database write',async()=>{
  let saves=0,checks=0;
  const persist=async(_db:string,input:any)=>{
    saves++;assert.equal(input.source,'website');
    assert.equal(input.transportLocation.customerConfirmed,true);
    return {bookingId:id,created:true,status:'requested'};
  };
  const verified=async(_token:string,_secret:string,hostname:string)=>{
    checks++;assert.equal(hostname,'example.workers.dev');return true;
  };
  const forged=await handleWorkerRequest(request(good,'https://other.invalid'),env,persist,{verifyChallenge:verified});
  assert.equal(forged.status,403);assert.equal(saves,0);assert.equal(checks,0);
  const denied=await handleWorkerRequest(request(),env,persist,{verifyChallenge:async()=>false});
  assert.equal(denied.status,403);assert.equal(saves,0);
  const allowed=await handleWorkerRequest(request(),env,persist,{verifyChallenge:verified});
  assert.equal(allowed.status,201);
  assert.deepEqual(await allowed.json(),{ok:true,reference:id.slice(0,8)});
  assert.equal(saves,1);assert.equal(checks,1);
});

test('invalid website payload and unconfirmed gate blocked before verification',async()=>{
  let checks=0;
  const opts={verifyChallenge:async()=>{checks++;return true;}};
  for(const payload of [
    {...good,booking:{...booking,transportLocation:undefined}},
    {...good,booking:{...booking,transportLocation:{...booking.transportLocation,customerConfirmed:false}}},
    {...good,booking:{...booking,externalResponseId:'not-a-uuid'}},
    {...good,booking:{...booking,source:'google_form'}},
    {...good,priceOverridePkr:500},
    {...good,turnstileToken:''}
  ]){
    const response=await handleWorkerRequest(request(payload),env,undefined,opts);
    assert.equal(response.status,400);
  }
  assert.equal(checks,0);
});

test('siteverify requires matching hostname and action; fake or reused challenge rejected',async()=>{
  const mock=(body:unknown,status=200):typeof fetch=>async(_url,options)=>{
    assert.equal(options?.redirect,'manual');
    return new Response(JSON.stringify(body),{status});
  };
  assert.equal(await verifyBookingChallenge('sample','secret','example.workers.dev',mock({
    success:true,hostname:'example.workers.dev',action:'apex-booking'})),true);
  for(const result of [
    {success:true,hostname:'evil.invalid',action:'apex-booking'},
    {success:true,hostname:'example.workers.dev',action:'wrong'},
    {success:false,hostname:'example.workers.dev',action:'apex-booking'}
  ]){
    assert.equal(await verifyBookingChallenge('sample','secret','example.workers.dev',mock(result)),false);
  }
  assert.equal(await verifyBookingChallenge('sample','secret','example.workers.dev',mock({},500)),false);
});

test('browser script parses, uses Google Maps links and has no embedded secrets',()=>{
  const script=readFileSync('public/book/app.js','utf8');
  assert.doesNotThrow(()=>new Script(script));
  assert.match(script,/api\/book\/location/);
  assert.doesNotMatch(script,/maplibregl|api\/book\/places/);
  assert.match(script,/customerConfirmed:true/);
  assert.match(script,/api\/book/);
  assert.doesNotMatch(script,/TURNSTILE_SECRET_KEY|DATABASE_URL|INTAKE_API_SECRET/);
});

test('booking and selected location are written in the same database transaction',async()=>{
  const input=parseIntake(booking,'website');
  const queries:Array<{sql:string;params:unknown[]|undefined}>=[];
  const answers=[
    {rows:[],rowCount:0},{rows:[{id:'event'}],rowCount:1},
    {rows:[{id:'owner'}],rowCount:1},{rows:[{id:'pet'}],rowCount:1},
    {rows:[{id:'booking'}],rowCount:1},
    {rows:[],rowCount:0},{rows:[],rowCount:0},{rows:[],rowCount:0},
    {rows:[],rowCount:0},{rows:[],rowCount:0}
  ];
  const client:DbClient={
    async query<T>(sql:string,params?:unknown[]):Promise<QueryResult<T>>{
      queries.push({sql,params});
      const value=answers.shift();
      if(!value)throw Error('Unexpected SQL');
      return value as QueryResult<T>;
    },
    release(){}
  };
  const saved=await saveBooking({connect:async()=>client},input);
  assert.equal(saved.bookingId,'booking');
  assert.equal(queries.at(-1)?.sql,'COMMIT');
  const location=queries.find(x=>x.sql.includes('booking_transport_locations'));
  assert.ok(location,'Must save coordinates with the parent booking');
  assert.deepEqual(location.params,['booking',33.7,73.1,'both',true]);
  assert.equal(queries.filter(x=>x.sql==='BEGIN').length,1);
  assert.equal(queries.filter(x=>x.sql==='COMMIT').length,1);
});
