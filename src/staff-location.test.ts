import test from 'node:test';
import assert from 'node:assert/strict';
import {readPinForm,renderStaffPinChecker} from './staff-location.ts';
import type {SharedPinResolution} from './shared-map-pin.ts';

const origin='https://apex.example.test';
const shared='https://maps.app.goo.gl/x7KMJZuXFG74HqQg8';
function form(url:string,body:string,contentType='application/x-www-form-urlencoded'):Request{
  return new Request(url,{method:'POST',headers:{
    origin, 'Content-Type':contentType
  },body});
}

test('bounded URL encoded form accepts one static Google Maps link',async()=>{
  const req=form(origin+'/staff/location',new URLSearchParams({pinUrl:shared}).toString());
  assert.equal(await readPinForm(req),shared);
});

test('form rejects unexpected fields, repeated links, missing link and malformed content',async()=>{
  for(const data of [
    '',
    'pinUrl=',
    'other=abc',
    'pinUrl=one&pinUrl=two',
    'pinUrl='+encodeURIComponent(shared)+'&bookingId=secret',
    'pinUrl='+encodeURIComponent('x'.repeat(2300)),
  ]){
    await assert.rejects(readPinForm(form(origin+'/staff/location',data)));
  }
  await assert.rejects(readPinForm(form(origin+'/staff/location',
    new URLSearchParams({pinUrl:shared}).toString(),'application/json')));
});

test('staff page displays numeric pin but never repeats pasted raw link',()=>{
  const resolved:SharedPinResolution={
    ok:true,pin:{lat:33.2992325,lon:73.2534561},
    verifiedBy:'google_maps_place',
    customerConfirmationRequired:true,roadEntranceConfirmed:false
  };
  const page=renderStaffPinChecker(resolved);
  assert.match(page,/33.2992325, 73.2534561/);
  assert.match(page,/Check that the pin marks a drivable entrance/);
  assert.match(page,/method="post"/);
  assert.match(page,/staff\/location/);
  assert.doesNotMatch(page,/x7KMJZuXFG74HqQg8/);
  assert.doesNotMatch(page,/Send invoice|Generate invoice/);
});
test('failed pin shows a human instruction without guessing location',()=>{
  const page=renderStaffPinChecker({ok:false,reason:'NOT_EXACT_PIN'});
  assert.match(page,/Couldn't read that location link/);
  assert.doesNotMatch(page,/<script/);
});
