import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@neondatabase/serverless';
import {isSyntheticBooking} from './synthetic-booking.ts';
import {isSyntheticAlertBooking} from './owner-booking-alerts.ts';
import {prepareStaffDraftReview,readStaffInvoiceSource,type StaffInvoiceSource} from './staff-invoice-draft.ts';
import {listStaffBookings} from './staff-bookings.ts';
import {readStaffBookingDetail} from './staff-booking-detail.ts';
import {makeReviewSnapshot,validateSnapshot} from './staff-saved-review.ts';

const markers:Parameters<typeof isSyntheticBooking>[0][]=[{customerName:'  sYnThEtIc sample'},{customerName:'Test Only fixture'},
  {customerName:'apex canary'}, {petName:'First dog, apex synthetic canary pet'},
  {externalResponseId:'APEX-CF-SMOKE-fixture'}];
const id='123e4567-e89b-42d3-a456-426614174001';
const base:StaffInvoiceSource={bookingId:id,customerName:'Fixture Owner',petNames:'Fixture Dog',
  petCount:1,startDate:'2026-12-01',endDate:'2026-12-03',status:'requested',
  cameraCageRequested:false,transportRequested:false,synthetic:false};

test('alerts, staff queue/detail and invoice source use the same synthetic classification',async t=>{
  let marker:typeof markers[number]={};
  t.mock.method(Client.prototype,'connect',async()=>undefined);
  t.mock.method(Client.prototype,'end',async()=>undefined);
  t.mock.method(Client.prototype,'query',(async(sql:string)=>{
    if(sql.includes('FROM public.booking_transport_locations'))return {rows:[]};
    if(sql.includes('SELECT p.name,p.breed'))return {rows:[{name:marker.petName??base.petNames,breed:null}]};
    assert(sql.includes('b.external_submission_id'),'query must retain raw source marker for the shared classifier');
    return {rows:[{id,status:base.status,customer_name:marker.customerName??base.customerName,
      pet_names:marker.petName??base.petNames,external_submission_id:marker.externalResponseId??null,
      start_date:base.startDate,end_date:base.endDate,pet_count:1,camera_pet_count:0,
      camera_cage_requested:false,pickup_dropoff_requested:false}]};
  }) as unknown as typeof Client.prototype.query);
  for(marker of [...markers,{}]){
    const expected=Object.keys(marker).length>0;
    const input={customerName:base.customerName,petName:base.petNames,externalResponseId:'fixture',...marker};
    assert.equal(isSyntheticBooking(input),expected);
    assert.equal(isSyntheticAlertBooking(input),expected);
    assert.equal((await listStaffBookings('synthetic://no-network',{status:'all',query:''}))[0].isSynthetic,expected);
    assert.equal((await readStaffBookingDetail('synthetic://no-network',id))?.isSynthetic,expected);
    const source=await readStaffInvoiceSource('synthetic://no-network',id);
    assert.equal(source?.synthetic,expected);
    assert.equal(JSON.stringify(source).includes('external_submission_id'),false,'internal source ID is not projected');
    assert.equal(makeReviewSnapshot(prepareStaffDraftReview(source!,'daily')).booking.synthetic,expected);
  }
});

test('names override a false draft/saved flag without mutating saved amounts or source',()=>{
  for(const marker of markers.filter(m=>m.customerName||m.petName)){
    const source={...base,customerName:marker.customerName??base.customerName,petNames:marker.petName??base.petNames};
    const review=prepareStaffDraftReview(source,'daily');
    assert.equal(source.synthetic,false);
    assert.equal(review.booking.synthetic,true);
    const snapshot=makeReviewSnapshot(review);snapshot.booking.synthetic=false;
    const before=structuredClone(snapshot);
    const decoded=validateSnapshot(snapshot);
    assert.equal(decoded.booking.synthetic,true);
    assert.deepEqual(decoded.quote,snapshot.quote);
    assert.deepEqual(snapshot,before,'persisted snapshot remains unchanged');
  }
});
