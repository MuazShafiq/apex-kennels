import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIntake,fingerprintIntake,IntakeError} from './intake.ts';
import {saveBooking,type DbClient,type QueryResult} from './booking-store.ts';

const base={
  source:'google_form', externalResponseId:'synthetic-full-001',
  customerName:'Synthetic Owner', phone:'03000000000',
  petName:'Synthetic Dog', startDate:'2026-12-10', endDate:'2026-12-13'
};

const details={
  ownerAddress:'123 Sample Street',
  pickupDropoffRequested:true,
  cameraCageRequested:false,
  emergencyContactPhone:'03000000001',
  breed:'Mixed breed',gender:'Male',age:'3 years',
  vaccinationStatus:'Fully vaccinated and booster is up to date',
  distemperHistory:'No',
  veterinarianPhone:'03000000002',
  personalityTraits:{friendly:true,allergies:false,medicalConditions:false},
  specialInstructions:'Synthetic care note',
  medicationFeedingInstructions:'Synthetic food preference',
  termsAccepted:true
};

const payload={...base,details};

const ok=(rows:Record<string,unknown>[]=[]):QueryResult=>({rows,rowCount:rows.length});
function mockDb(responses:(QueryResult|Error)[]) {
  const queries:Array<{sql:string;params?:unknown[]}>=[];
  let released=false;
  const client:DbClient={
    async query<T>(sql:string,params?:unknown[]):Promise<QueryResult<T>>{
      queries.push({sql,params});
      const result=responses.shift();
      if(!result) throw new Error('Unexpected SQL call');
      if(result instanceof Error) throw result;
      return result as QueryResult<T>;
    },
    release(){released=true;}
  };
  return {pool:{async connect(){return client;}},queries,get released(){return released;}};
}

test('full synthetic form data is normalized, and not treated as invoice pricing',()=>{
  const parsed=parseIntake(payload);
  assert.equal(parsed.details?.breed,'Mixed breed');
  assert.equal(parsed.details?.pickupDropoffRequested,true);
  assert.equal(parsed.details?.cameraCageRequested,false);
  assert.deepEqual(parsed.details?.personalityTraits,{friendly:true,allergies:false,medicalConditions:false});
  assert.equal('pricePerDayPkr' in parsed,false);
  assert.equal('totalPkr' in parsed,false);
});

test('required Form health and consent fields cannot disappear silently',()=>{
  assert.throws(()=>parseIntake({...payload,details:{...details,ownerAddress:undefined}}),/Missing required ownerAddress/);
  assert.throws(()=>parseIntake({...payload,details:{...details,termsAccepted:false}}),/Terms acknowledgement required/);
  assert.throws(()=>parseIntake({...payload,details:{...details,cameraCageRequested:undefined}}),/Missing boarding add-on choices/);
  assert.throws(()=>parseIntake({...payload,details:{...details,vaccinationStatus:'Maybe'}}),/Invalid vaccinationStatus/);
  assert.throws(()=>parseIntake({...payload,details:{...details,distemperHistory:'Negative'}}),/Invalid distemperHistory/);
  assert.throws(()=>parseIntake({...payload,details:{...details,personalityTraits:{unknown:true}}}),/Invalid personalityTraits value/);
  assert.throws(()=>parseIntake({...payload,details:{...details,extraSensitiveField:'hidden'}}),/Unexpected details field/);
});

test('care notes may contain newlines but not control bytes or huge payloads',()=>{
  assert.equal(parseIntake({...payload,details:{...details,specialInstructions:'line one\nline two'}}).details?.specialInstructions,'line one\nline two');
  assert.throws(()=>parseIntake({...payload,details:{...details,specialInstructions:'x'.repeat(4000)}}),/Invalid specialInstructions/);
  assert.throws(()=>parseIntake({...payload,details:{...details,specialInstructions:'bad\u0000'}}),/Invalid specialInstructions/);
});

test('full Form fingerprint changes when medication or behavioral safety answer changes',()=>{
  const one=parseIntake(payload);
  const two=parseIntake({...payload,details:{...details,medicationFeedingInstructions:'Changed feeding schedule'}});
  assert.notEqual(fingerprintIntake(one),fingerprintIntake(two));
  const three=parseIntake({...payload,details:{...details,personalityTraits:{friendly:true,allergies:true}}});
  assert.notEqual(fingerprintIntake(one),fingerprintIntake(three));
});

test('full form details write in same transaction, with explicit consent and digest',async()=>{
  const db=mockDb([
    ok(),ok([{id:'event-id'}]),ok([{id:'owner-id'}]),
    ok([{id:'pet-id'}]),ok([{id:'booking-id'}]),ok(),ok(),ok(),ok()
  ]);
  const saved=await saveBooking(db.pool,parseIntake(payload));
  assert.deepEqual(saved,{bookingId:'booking-id',created:true,status:'requested'});
  const form=db.queries.find(q=>q.sql.includes('INSERT INTO public.booking_form_details'));
  assert.ok(form);
  assert.equal(form.params?.[0],'booking-id');
  assert.equal(form.params?.[1],'123 Sample Street');
  assert.equal(form.params?.[13],true);
  const p=db.queries.find(q=>q.sql.includes('INSERT INTO public.pets'));
  assert.equal(p?.params?.[2],'Mixed breed');
  const event=db.queries.find(q=>q.sql.includes('INSERT INTO public.form_ingestion_events'));
  assert.match(String(event?.params?.[2]),/^[a-f0-9]{64}$/);
  assert.equal(db.queries.at(-1)?.sql,'COMMIT');
  assert.equal(db.released,true);
});

test('full duplicate uses persisted digest, rejects changed notes before any other writes',async()=>{
  const parsed=parseIntake(payload);
  const existing={
    id:'book-old',status:'reviewing',external_response_id:'synthetic-full-001',
    customer_name:'Synthetic Owner',email:null,phone:'03000000000',
    pet_name:'Synthetic Dog',start_date:'2026-12-10',end_date:'2026-12-13',
    accommodation_type:null,payload_fingerprint:fingerprintIntake(parsed)
  };
  const same=mockDb([ok(),ok(),ok([existing]),ok()]);
  assert.deepEqual(await saveBooking(same.pool,parsed),{bookingId:'book-old',created:false,status:'reviewing'});
  assert.equal(same.queries.at(-1)?.sql,'COMMIT');
  const changed=mockDb([ok(),ok(),ok([existing]),ok()]);
  await assert.rejects(saveBooking(changed.pool,parseIntake({
    ...payload,details:{...details,medicationFeedingInstructions:'Altered'}
  })),(err:unknown)=>{
    assert.ok(err instanceof IntakeError);
    assert.equal(err.status,409);
    return true;
  });
  assert.equal(changed.queries.at(-1)?.sql,'ROLLBACK');
  assert.equal(changed.released,true);
});
