import test from 'node:test';
import assert from 'node:assert/strict';
import {preliminaryDraftFromForm} from './provisional-quote.ts';
import {parseIntake} from './intake.ts';

const baseline={
  source:'google_form',externalResponseId:'synthetic-quote',
  customerName:'Synthetic Person',phone:'03000000000',
  petName:'Synthetic Dog',startDate:'2026-10-22',endDate:'2026-11-08'
} as const;
const detail={
  ownerAddress:'Synthetic Street',pickupDropoffRequested:false,cameraCageRequested:false,
  emergencyContactPhone:'03000000001',breed:'Mixed',gender:'Male',age:'2 years',
  vaccinationStatus:'None',distemperHistory:'No',termsAccepted:true
};

test('historical standard quote is boarding-only and always requires review',()=>{
  const input=parseIntake({...baseline,details:detail});
  const draft=preliminaryDraftFromForm(input);
  assert.equal(draft.billedDays,18);
  assert.equal(draft.rateTier,'standard');
  assert.equal(draft.boardingRatePkr,2500);
  assert.equal(draft.boardingOnlySubtotalPkr,45000);
  assert.equal(draft.status,'REVIEW_REQUIRED');
  assert.equal(draft.requiresTransportPricing,false);
  assert.equal('totalPkr' in draft,false);
  assert.equal('invoice' in draft,false);
});

test('camera draft uses observed 3000/day without auto-including a pickup fee',()=>{
  const input=parseIntake({...baseline,details:{...detail,cameraCageRequested:true,pickupDropoffRequested:true}});
  const draft=preliminaryDraftFromForm(input);
  assert.equal(draft.boardingOnlySubtotalPkr,54000);
  assert.equal(draft.requiresTransportPricing,true);
  assert.ok(draft.exclusions.some(x=>x.includes('transport')));
  assert.equal('totalPkr' in draft,false);
});

test('missing camera preference must not silently default to standard',()=>{
  const input=parseIntake(baseline);
  assert.throws(()=>preliminaryDraftFromForm(input),/Camera cage preference not confirmed/);
});

test('historical monthly boarding is 30 inclusive days without inventing a long-stay discount',()=>{
  const input=parseIntake({...baseline,startDate:'2026-11-01',endDate:'2026-11-30',details:detail});
  const draft=preliminaryDraftFromForm(input);
  assert.equal(draft.billedDays,30);
  assert.equal(draft.boardingOnlySubtotalPkr,75000);
  assert.ok(draft.exclusions.some(x=>x.includes('discounts')));
});
