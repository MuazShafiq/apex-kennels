import assert from 'node:assert/strict';
import test from 'node:test';
import {handleWorkerRequest, type StaffOptions, type WorkerEnv} from './cloudflare-worker.ts';
import {handleBusinessSettings} from './staff-business-settings.ts';
import type {RateCard} from './rate-card.ts';

const origin='https://example.workers.dev';
const owner='fixture-owner@example.test';
const staff='fixture-staff@example.test';
const databaseUrl='postgresql://unused.invalid/fixture';
const current:RateCard={
  version:3,effectiveFrom:'2026-11-01T00:00:00+05:00',stdDaily:2500,cameraDaily:3000,
  packageDiscount:10000,packageDays:30,kmPerLitre:12,markupPct:20,freshnessHours:24,
  fuelMode:'published',fixedFuelPkr:null,fixedUntil:null,fixedReason:null,
  summary:'Current rates',createdBy:owner,createdAt:'2026-11-01T00:00:00+05:00',
};
const env:WorkerEnv={
  DATABASE_URL:databaseUrl,STAFF_ACCESS_AUD:'apex-staff-fixture-audience',
  STAFF_ALLOWED_EMAILS:owner+','+staff,APEX_INVOICE_OWNER_EMAIL:owner,APEX_RATE_CARDS_ENABLED:'true',
};
const read=async()=>({now:new Date('2026-11-28T09:00:00Z'),current,cards:[current],
  impact:{issued:3,saved:2,open:1},highestReservedNumber:413});
const context=(email:string):StaffOptions['context']=>({
  access:{aud:env.STAFF_ACCESS_AUD!,getIdentity:async()=>({email})},
});
const api=origin+'/staff/settings/rate-cards';

test('staff tools require the signed staff lane and have a separate feature gate',async()=>{
  for(const path of ['/staff/settings','/staff/studio','/staff/studio/src/studio.js']){
    for(const [requestEnv,opts,expected] of [
      [env,{},403],[env,{context:context('unallowlisted@example.test')},403],
      [{...env,APEX_RATE_CARDS_ENABLED:'false'},{context:context(staff)},503],
    ] as const){
      const response=await handleWorkerRequest(new Request(origin+path),requestEnv,undefined,opts);
      assert.equal(response.status,expected);
    }
  }
  const options={context:context(staff),businessSettings:{read}};
  const page=await handleWorkerRequest(new Request(origin+'/staff/settings'),env,undefined,options);
  assert.equal(page.status,200);
  const html=await page.text();
  assert.match(html,/Only the owner can publish rate cards/);
  assert.match(html,/id="stdDaily"[^>]* disabled/);
  assert.doesNotMatch(html,/id="publish"/);
  assert.match(html,/aria-current="page">Business settings/);
  const staffMutation=await handleWorkerRequest(new Request(api,{method:'POST'}),env,undefined,options);
  assert.equal(staffMutation.status,403);
  const studio=await handleWorkerRequest(new Request(origin+'/staff/studio'),env,undefined,{context:context(staff)});
  assert.equal(studio.status,200);
  assert.match(await studio.text(),/id="stay-log-studio"/);
});

test('settings publish requires recent owner authentication, same origin and a session-scoped CSRF token',async()=>{
  const jwt='signed-session-stand-in';
  let called=0;
  const publish=async()=>{ called++;return {version:4,effectiveFrom:current.effectiveFrom,summary:'fixture',withdrew:null}; };
  const invoke=(request:Request,recent:boolean)=>handleBusinessSettings(
    request,databaseUrl,owner,true,recent,{},r=>r.json(),{read,publish},
  );
  const create=(csrf:string,site=origin,assertion=jwt)=>new Request(api,{
    method:'POST',headers:{
      'Cf-Access-Jwt-Assertion':assertion,'Origin':site,'Content-Type':'application/json','X-Apex-Settings-CSRF':csrf,
    },body:'{}',
  });
  const page=await invoke(new Request(origin+'/staff/settings',{headers:{'Cf-Access-Jwt-Assertion':jwt}}),false);
  const html=await page.text();
  const csrf=html.match(/data-csrf="([0-9a-f]{64})"/)?.[1]??'';
  assert.equal(csrf.length,64);
  assert.doesNotMatch(html,new RegExp(jwt));
  assert.equal((await invoke(create(csrf),false)).status,403);
  assert.equal((await invoke(create(csrf,'https://other.example.test'),true)).status,403);
  assert.equal((await invoke(create(csrf,origin,'other-session'),true)).status,403);
  assert.equal((await invoke(create('invalid'),true)).status,403);
  assert.equal(called,0);
  assert.equal((await invoke(create(csrf),true)).status,200);
  assert.equal(called,1);
});
