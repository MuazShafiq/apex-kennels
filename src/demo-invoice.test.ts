import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import {syntheticInvoiceHtml} from './demo-invoice.ts';
import {handleWorkerRequest} from './cloudflare-worker.ts';

test('invoice preview is clearly synthetic, draft-only and not payable',()=>{
  const html=syntheticInvoiceHtml();
  assert.match(html,/SYNTHETIC EXAMPLE/);
  assert.match(html,/NOT FOR CUSTOMER DELIVERY/);
  assert.match(html,/SYNTHETIC EXAMPLE/);
  assert.match(html,/DEMO-0001/);
  assert.match(html,/INTERNAL PREVIEW/);
  assert.match(html,/Sample Owner/);
  assert.match(html,/Boarding \(example only\)/);
  assert.doesNotMatch(html,/MUHAMMAD ZAIN|FATIMA SHABBIR|PK29MPBL|PK90HABB/);
});

test('public invoice demo uses original Canva PDF and no production secrets',async()=>{
  const blank=readFileSync('public/invoice/canva-blank.pdf');
  const env={ASSETS:{fetch:async(_request:Request)=>new Response(
    new Blob([new Uint8Array(blank)],{type:'application/pdf'}))}};
  const response=await handleWorkerRequest(
    new Request('https://example.workers.dev/demo/invoice'),env);
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type')??'',/application\/pdf/);
  assert.match(response.headers.get('content-disposition')??'',/^inline;/);
  const pdf=await PDFDocument.load(await response.arrayBuffer());
  assert.equal(pdf.getPageCount(),1);
  assert.match(pdf.getSubject()??'',/not an issued invoice/);
  const missingTemplate=await handleWorkerRequest(
    new Request('https://example.workers.dev/demo/invoice'),{});
  assert.equal(missingTemplate.status,503);
});

test('invoice demo is GET only',async()=>{
  const response=await handleWorkerRequest(new Request('https://example.workers.dev/demo/invoice',{method:'POST'}),{});
  assert.equal(response.status,405);
});
