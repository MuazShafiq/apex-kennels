import test from 'node:test';
import assert from 'node:assert/strict';
import {APEX_KENNEL_LOCATION,APEX_KENNEL_ACCESS} from './apex-location-config.ts';
import {routeApexTransport} from './transport-route.ts';

test('kennel and identified Bawli access pins match evidence and stay independent',()=>{
  assert.deepEqual(APEX_KENNEL_LOCATION.pin,{lat:33.2992325,lon:73.2534561});
  assert.deepEqual(APEX_KENNEL_ACCESS.pin,{lat:33.31392,lon:73.2581});
  assert.equal(APEX_KENNEL_ACCESS.businessIdentityConfirmedByOwner,true);
  assert.equal(APEX_KENNEL_ACCESS.pinConfirmed,true);
  assert.equal(APEX_KENNEL_ACCESS.roadApproachValidated,false);
  assert.equal(APEX_KENNEL_ACCESS.pinSource,'OpenStreetMap way 256757113 via Mapcarta');
  assert.equal(APEX_KENNEL_LOCATION.entranceConfirmed,false);
});

test('a mapped landmark never bypasses unverified kennel entrance or customer pin',async()=>{
  let calls=0;
  const f:typeof fetch=async()=>{calls++;return new Response('{}');};
  const result=await routeApexTransport({
    kennelPin:APEX_KENNEL_LOCATION.pin,
    kennelPinConfirmed:APEX_KENNEL_LOCATION.entranceConfirmed,
    kennelAccessWaypoint:APEX_KENNEL_ACCESS.pin,
    kennelAccessWaypointConfirmed:APEX_KENNEL_ACCESS.pinConfirmed,
    customerPin:undefined,customerPinConfirmed:false,
    visit:'pickup',
  },{apiKey:'synthetic-geocode-key',fetcher:f});
  assert.equal(result.ok,false);
  assert.equal(calls,0);
});

test('route builder enforces actual Bawli waypoint in both directions when staff validates pins',async()=>{
  let observed='';
  const f:typeof fetch=async (u)=>{
    observed=String(u);
    return new Response(JSON.stringify({features:[{properties:{distance:16400}}]}),{status:200});
  };
  const r=await routeApexTransport({
    kennelPin:APEX_KENNEL_LOCATION.pin,kennelPinConfirmed:true,
    kennelAccessWaypoint:APEX_KENNEL_ACCESS.pin,kennelAccessWaypointConfirmed:true,
    customerPin:{lat:33.41,lon:73.12},customerPinConfirmed:true,
    visit:'pickup'
  },{apiKey:'synthetic-geocode-key',fetcher:f});
  assert.equal(r.ok,true);
  const wp=new URL(observed).searchParams.get('waypoints');
  assert.equal(wp,'33.2992325,73.2534561|33.31392,73.2581|33.41,73.12|33.31392,73.2581|33.2992325,73.2534561');
  if(r.ok)assert.equal(r.estimate.needsStaffConfirmation,true);
});
