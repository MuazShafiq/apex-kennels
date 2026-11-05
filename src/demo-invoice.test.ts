import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticInvoiceHtml} from './demo-invoice.ts';
import {handleWorkerRequest} from './cloudflare-worker.ts';

test('invoice preview is clearly synthetic, draft-only and not payable',()=>{
  const html=syntheticInvoiceHtml();
  assert.match(html,/SYNTHETIC EXAMPLE/);
  assert.match(html,/NOT FOR CUSTOMER DELIVERY/);
  assert.match(html,/RATE UNAPPROVED/);
  assert.match(html,/DEMO-0001/);
  assert.match(html,/DRAFT/);
  assert.match(html,/Sample Owner/);
  assert.match(html,/Boarding \(example only\)/);
  assert.doesNotMatch(html,/MUHAMMAD ZAIN|FATIMA SHABBIR|PK29MPBL|PK90HABB/);
});

test('public invoice demo does not require or reveal production secrets',async()=>{
  const response=await handleWorkerRequest(new Request('https://example.workers.dev/demo/invoice'),{});
  assert.equal(response.status,200);
  assert.match(await response.text(),/SYNTHETIC EXAMPLE/);
  assert.match(response.headers.get('content-security-policy')||'',/default-src 'none'/);
});

test('invoice demo is GET only',async()=>{
  const response=await handleWorkerRequest(new Request('https://example.workers.dev/demo/invoice',{method:'POST'}),{});
  assert.equal(response.status,405);
});
