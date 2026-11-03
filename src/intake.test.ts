import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIntake, IntakeError} from './intake.ts';
import {saveBooking, type DbClient, type QueryResult} from './booking-store.ts';

const payload = {
  source:'google_form', externalResponseId:'synthetic-001',
  customerName:'Sample Owner', email:'SAMPLE@example.com',
  petName:'Sample Dog', startDate:'2026-12-01',endDate:'2026-12-04'
};

test('normalizes validated form input; rejects malformed dates and costs injected as input',()=>{
  const parsed = parseIntake(payload);
  assert.equal(parsed.email,'sample@example.com');
  assert.equal(parsed.source,'google_form');
  assert.equal('totalPkr' in parsed,false);
  assert.throws(()=>parseIntake({...payload,endDate:'2026-11-30'}),/duration/);
  assert.throws(()=>parseIntake({...payload,startDate:'2026-02-31'}),/Invalid startDate/);
  assert.throws(()=>parseIntake({...payload,externalResponseId:''}),/externalResponseId/);
  assert.throws(()=>parseIntake({...payload,source:'website'}),/source/);
  assert.throws(()=>parseIntake({...payload,email:undefined,phone:undefined}),/contact/);
});

function scriptedDb(responses: (QueryResult | Error)[]) {
  const queries: Array<{sql:string;params?:unknown[]}> = [];
  let released=false;
  const client: DbClient = {
    async query<T>(sql:string,params?:unknown[]):Promise<QueryResult<T>> {
      queries.push({sql,params});
      const response=responses.shift();
      if (!response) throw new Error('Unexpected SQL statement');
      if (response instanceof Error) throw response;
      return response as QueryResult<T>;
    },
    release(){released=true;}
  };
  return {pool:{async connect(){return client}},queries,get released(){return released}};
}
const ok=(rows:Record<string,unknown>[]=[]):QueryResult=>({rows,rowCount:rows.length});

test('new booking is saved as requested, with one transaction and linked pet',async()=>{
  const db=scriptedDb([
    ok(),ok([{id:'event-id'}]),ok([{id:'owner-id'}]),
    ok([{id:'pet-id'}]),ok([{id:'booking-id'}]),
    ok(),ok(),ok()
  ]);
  const saved=await saveBooking(db.pool,parseIntake(payload));
  assert.deepEqual(saved,{bookingId:'booking-id',created:true,status:'requested'});
  assert.equal(db.queries.length,8);
  assert.equal(db.queries[0].sql,'BEGIN');
  assert.equal(db.queries.at(-1)?.sql,'COMMIT');
  assert.equal(db.queries.some(x=>x.sql.includes('INSERT INTO public.booking_pets')),true);
  assert.equal(db.released,true);
});

test('duplicate submission returns existing booking instead of inserting again',async()=>{
  const existing={
    id:'book-old',status:'reviewing',external_response_id:'synthetic-001',
    customer_name:'Sample Owner',email:'sample@example.com',phone:null,
    pet_name:'Sample Dog',start_date:'2026-12-01',end_date:'2026-12-04',accommodation_type:null
  };
  const db=scriptedDb([ok(),ok(),ok([existing]),ok()]);
  const saved=await saveBooking(db.pool,parseIntake(payload));
  assert.deepEqual(saved,{bookingId:'book-old',created:false,status:'reviewing'});
  assert.equal(db.queries.length,4);
  assert.equal(db.released,true);
});

test('changed payload with existing submission ID produces conflict and rollback',async()=>{
  const existing={
    id:'book-old',status:'reviewing',external_response_id:'synthetic-001',
    customer_name:'Different Owner',email:'sample@example.com',phone:null,
    pet_name:'Sample Dog',start_date:'2026-12-01',end_date:'2026-12-04',accommodation_type:null
  };
  const db=scriptedDb([ok(),ok(),ok([existing]),ok()]);
  await assert.rejects(saveBooking(db.pool,parseIntake(payload)),(e:unknown)=>{
    assert.ok(e instanceof IntakeError); assert.equal(e.status,409); return true;
  });
  assert.equal(db.queries.at(-1)?.sql,'ROLLBACK');
  assert.equal(db.released,true);
});

test('database failure rolls back all inserts and releases the connection',async()=>{
  const db=scriptedDb([ok(),ok([{id:'event-id'}]),new Error('DB fault'),ok()]);
  await assert.rejects(saveBooking(db.pool,parseIntake(payload)),/DB fault/);
  assert.equal(db.queries.at(-1)?.sql,'ROLLBACK');
  assert.equal(db.released,true);
});
