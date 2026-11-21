import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIntake,fingerprintIntake} from './intake.ts';
import {saveBooking,type DbClient,type QueryResult} from './booking-store.ts';
import {parsePublicBookingEnvelope} from './public-booking.ts';

const details={
  ownerAddress:'Synthetic Address',emergencyContactPhone:'03001112222',
  breed:'Mixed',gender:'Male',age:'2 years',
  vaccinationStatus:'Fully vaccinated and booster is up to date',
  distemperHistory:'No',pickupDropoffRequested:false,cameraCageRequested:false,
  termsAccepted:true,
  personalityTraits:{friendly:false,fears:false,climber:false,foodSensitivities:false,
    barksExcessively:false,allergies:false,biteHistory:false,medicalConditions:false}
};
const base={source:'website',externalResponseId:'a123e456-789b-4123-a456-426614174001',
  customerName:'Synthetic Owner',phone:'03001112222',petName:'Synthetic Pet',
  startDate:'2026-12-10',endDate:'2026-12-13',details};
const ok=(rows:Record<string,unknown>[]=[]):QueryResult=>({rows,rowCount:rows.length});
const makeDb=()=>{
  const queries:{sql:string;params?:unknown[]}[]=[];
  const ids=['event-id','customer-id','pet-id','booking-id'];
  const db:DbClient={
    async query<T>(sql:string,params?:unknown[]):Promise<QueryResult<T>>{
      queries.push({sql,params});
      if(sql.startsWith('INSERT INTO public.form_ingestion_events'))return ok([{id:ids[0]}]) as QueryResult<T>;
      if(sql.startsWith('INSERT INTO public.customers'))return ok([{id:ids[1]}]) as QueryResult<T>;
      if(sql.startsWith('INSERT INTO public.pets'))return ok([{id:ids[2]}]) as QueryResult<T>;
      if(sql.startsWith('INSERT INTO public.booking_requests'))return ok([{id:ids[3]}]) as QueryResult<T>;
      return ok() as QueryResult<T>;
    },
    release(){}
  };
  return {queries,pool:{async connect(){return db;}}};
};
test('historical optional evidence remains independent of the new public form requirement',()=>{
  const no=parseIntake(base,'website');
  const yes=parseIntake({...base,details:{...details,whatsappInvoiceOptIn:true}},'website');
  assert.equal(no.details?.whatsappInvoiceOptIn,undefined);
  assert.equal(yes.details?.whatsappInvoiceOptIn,true);
  assert.equal(yes.details?.whatsappServiceOptIn,undefined);
  assert.notEqual(fingerprintIntake(no),fingerprintIntake(yes));
  assert.throws(()=>parseIntake({...base,details:{...details,whatsappInvoiceOptIn:'yes'}},'website'));
  assert.throws(()=>parseIntake({...base,phone:undefined,email:'test@example.test',
    details:{...details,whatsappInvoiceOptIn:true}},'website'),/WhatsApp consent requires/);
});

test('V10.6 records distinguishable explicit service consent in the booking transaction',async()=>{
  const db=makeDb();
  const {booking}=parsePublicBookingEnvelope({
    booking:{...base,details:{...details,whatsappServiceOptIn:true}},
    turnstileToken:'synthetic-token'
  });
  const historical=parseIntake({...base,details:{...details,whatsappInvoiceOptIn:true}},'website');
  assert.notEqual(fingerprintIntake(booking),fingerprintIntake(historical));
  await saveBooking(db.pool,booking);
  const consent=db.queries.find(x=>x.sql.includes('INSERT INTO public.booking_whatsapp_consents'));
  assert.deepEqual(consent?.params,['booking-id','03001112222','website-booking-v2','website']);
  assert.equal(db.queries[0].sql,'BEGIN');
  assert.equal(db.queries.at(-1)?.sql,'COMMIT');
});

test('only explicitly opted-in website bookings persist a WhatsApp consent record',async()=>{
  const yes=makeDb();
  await saveBooking(yes.pool,parseIntake({
    ...base,details:{...details,whatsappInvoiceOptIn:true}
  },'website'));
  const consent=yes.queries.filter(x=>x.sql.includes('INSERT INTO public.booking_whatsapp_consents'));
  assert.equal(consent.length,1);
  assert.deepEqual(consent[0].params,['booking-id','03001112222','website-booking-v1','website']);
  assert.equal(yes.queries.at(-1)?.sql,'COMMIT');
  const no=makeDb();
  await saveBooking(no.pool,parseIntake({
    ...base,details:{...details,whatsappInvoiceOptIn:false}
  },'website'));
  assert.equal(no.queries.some(x=>x.sql.includes('booking_whatsapp_consents')),false);
});
test('legacy Google Form submissions never imply WhatsApp permission',async()=>{
  const form=makeDb();
  await saveBooking(form.pool,parseIntake({
    ...base,source:'google_form',externalResponseId:'legacy-form-001',
    details:{...details}
  }));
  assert.equal(form.queries.some(x=>x.sql.includes('booking_whatsapp_consents')),false);
  assert.throws(()=>parseIntake({
    ...base,source:'google_form',details:{...details,whatsappServiceOptIn:true}
  }),/Unexpected details field/);
});
