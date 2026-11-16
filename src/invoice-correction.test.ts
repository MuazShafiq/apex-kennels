import test from 'node:test';
import assert from 'node:assert/strict';
import {recordInvoiceCorrection} from './invoice-correction.ts';

const id='123e4567-e89b-42d3-a456-426614174001',owner='owner@example.test';
test('correction rejects disabled/nonowner/unsafe requests before database access',async()=>{
  let connections=0;
  const factory=()=>{connections++;throw new Error('No database expected');};
  const config={enabled:'true',ownerEmail:owner};
  await assert.rejects(recordInvoiceCorrection('fake',id,owner,{...config,enabled:'false'},{kind:'cancel',reason:'Fixture'},factory),/disabled/);
  await assert.rejects(recordInvoiceCorrection('fake',id,'other@example.test',config,{kind:'cancel',reason:'Fixture'},factory),/Only/);
  for(const input of [
    {kind:'cancel' as const,reason:''},
    {kind:'cancel' as const,reason:'Unsafe\nreason'},
    {kind:'cancel' as const,reason:'x'.repeat(201)},
    {kind:'cancel' as const,reason:'Fixture',replacementNumber:'0200'},
    {kind:'replace' as const,reason:'Fixture',replacementNumber:'1e03',replacementReference:'Fixture'},
    {kind:'replace' as const,reason:'Fixture',replacementNumber:'0200',replacementReference:'<script>'},
    {kind:'replace' as const,reason:'Fixture',replacementNumber:'0200'},
  ])await assert.rejects(recordInvoiceCorrection('fake',id,owner,config,input,factory),/Provide a correction/);
  assert.equal(connections,0);
});
