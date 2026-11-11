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
    termsAccepted:true,
    personalityTraits:{friendly:false,fears:false,climber:false,foodSensitivities:false,
      barksExcessively:false,allergies:false,biteHistory:false,medicalConditions:false}
  },
  transportLocation:{latitude:33.7,longitude:73.1,service:'pickup',customerConfirmed:true}
};

test('website submission includes customer-picked coordinates and is distinct from Google Form',()=>{
  const row=parseIntake(base,'website');
  assert.equal(row.source,'website');
  assert.deepEqual(row.transportLocation,{latitude:33.7,longitude:73.1,service:'pickup',customerConfirmed:true});
  assert.throws(()=>parseIntake(base),/Unsupported booking source/);
});

test('transport bookings cannot omit an exact map location',()=>{
  const {transportLocation,...missing}=base;
  assert.throws(()=>parseIntake(missing,'website'),/Pickup location is required/);
  assert.throws(()=>parseIntake({...base,transportLocation:{
    latitude:91,longitude:73,service:'pickup',customerConfirmed:true
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
    latitude:33.7001,longitude:73.1,service:'pickup',customerConfirmed:true
  }},'website');
  assert.notEqual(fingerprintIntake(a),fingerprintIntake(b));
});

test('Both can use a second exact drop-off gate, with independent validation and identity',()=>{
  const separate={...base,
    transportLocation:{...base.transportLocation,service:'both'},
    transportDropoffLocation:{latitude:33.58,longitude:73.02,customerConfirmed:true}
  };
  const parsed=parseIntake(separate,'website');
  assert.deepEqual(parsed.transportDropoffLocation,separate.transportDropoffLocation);
  const same={...separate,transportDropoffLocation:undefined};
  assert.equal(parseIntake(same,'website').transportDropoffLocation,undefined);
  assert.notEqual(fingerprintIntake(parsed),fingerprintIntake(parseIntake(same,'website')));
  assert.notEqual(fingerprintIntake(parsed),fingerprintIntake(parseIntake({
    ...separate,transportDropoffLocation:{...separate.transportDropoffLocation,latitude:33.581}
  },'website')));
  for(const invalid of [
    {...separate,transportDropoffLocation:{...separate.transportDropoffLocation,latitude:31.5}},
    {...separate,transportDropoffLocation:{...separate.transportDropoffLocation,customerConfirmed:false}},
    {...separate,transportDropoffLocation:{...separate.transportDropoffLocation,service:'dropoff'}},
    {...separate,transportLocation:{...separate.transportLocation,service:'pickup'}},
    {...separate,transportLocation:{...separate.transportLocation,service:'dropoff'}},
    {...separate,details:{...separate.details,pickupDropoffRequested:false}},
  ]) assert.throws(()=>parseIntake(invalid,'website'));
});

test('original Google Form handler retains previous source restrictions and missing pin tolerance',()=>{
  const old={...base,source:'google_form',externalResponseId:'synthetic-original'};
  const {transportLocation,...unmodified}=old;
  assert.doesNotThrow(()=>parseIntake(unmodified));
  assert.throws(()=>parseIntake({...unmodified,source:'website'}),/Unsupported booking source/);
});

test('pickup/drop-off coordinates outside Islamabad and Rawalpindi are rejected',()=>{
  for(const point of [
    {latitude:31.52,longitude:74.35}, // Lahore
    {latitude:34.10,longitude:73.39}, // beyond the Islamabad–Rawalpindi coverage area
    {latitude:33.70,longitude:72.50}  // too far west
  ]){
    assert.throws(()=>parseIntake({...base,transportLocation:{
      ...base.transportLocation,...point
    }},'website'),/Invalid pickup location/);
  }
});
test('boarding without transport still permits customer addresses outside service area',()=>{
  const {transportLocation,...noPin}=base;
  const row=parseIntake({...noPin,details:{...base.details,
    ownerAddress:'Somewhere outside Islamabad and Rawalpindi',
    pickupDropoffRequested:false
  }},'website');
  assert.equal(row.transportLocation,undefined);
});
