import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIntake,fingerprintIntake} from './intake.ts';

const base={
  source:'website',externalResponseId:'a123e456-789b-4123-a456-426614174001',
  customerName:'Synthetic Owner',phone:'03000000000',
  petName:'Synthetic Pet',startDate:'2026-12-10',endDate:'2026-12-12',
  details:{
    ownerAddress:'Synthetic Street',emergencyContactPhone:'03000000001',
    breed:'Mixed',gender:'Female',age:'2 years',
    vaccinationStatus:'Fully vaccinated and booster is up to date',
    distemperHistory:'No',pickupDropoffRequested:true,cameraCageRequested:false,
    termsAccepted:true
  },
  transportLocation:{latitude:33.7,longitude:73.1,service:'pickup'}
};

test('website submission includes customer-picked coordinates and is distinct from Google Form',()=>{
  const row=parseIntake(base,'website');
  assert.equal(row.source,'website');
  assert.deepEqual(row.transportLocation,{latitude:33.7,longitude:73.1,service:'pickup'});
  assert.throws(()=>parseIntake(base),/Unsupported booking source/);
});

test('transport bookings cannot omit an exact map location',()=>{
  const {transportLocation,...missing}=base;
  assert.throws(()=>parseIntake(missing,'website'),/Pickup location is required/);
  assert.throws(()=>parseIntake({...base,transportLocation:{
    latitude:91,longitude:73,service:'pickup'
  }},'website'),/Invalid pickup location/);
});

test('booking without transport cannot secretly submit a location',()=>{
  const noTransport={...base,details:{...base.details,pickupDropoffRequested:false}};
  assert.throws(()=>parseIntake(noTransport,'website'),/Unexpected pickup location/);
  const {transportLocation,...valid}=noTransport;
  const row=parseIntake(valid,'website');
  assert.equal(row.transportLocation,undefined);
});

test('changed location changes the immutable intake fingerprint',()=>{
  const a=parseIntake(base,'website');
  const b=parseIntake({...base,transportLocation:{
    latitude:33.7001,longitude:73.1,service:'pickup'
  }},'website');
  assert.notEqual(fingerprintIntake(a),fingerprintIntake(b));
});

test('original Google Form handler retains previous source restrictions and missing pin tolerance',()=>{
  const old={...base,source:'google_form',externalResponseId:'synthetic-original'};
  const {transportLocation,...unmodified}=old;
  assert.doesNotThrow(()=>parseIntake(unmodified));
  assert.throws(()=>parseIntake({...unmodified,source:'website'}),/Unsupported booking source/);
});
