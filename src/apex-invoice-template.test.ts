import test from 'node:test';
import assert from 'node:assert/strict';
import {buildApexInvoiceDraft} from './apex-invoice-draft.ts';
import {renderInvoiceHtml} from './invoice.ts';

const monthly=buildApexInvoiceDraft({
  startDate:'2026-11-01',endDate:'2026-11-30',cage:'normal',
  petCount:1,fullMonthPackageSelected:true,transport:{requested:false}
}).quote;

test('template preserves Fatima original blue bands, identity grid and four service rows',()=>{
  const html=renderInvoiceHtml({
    number:'REVIEW-TEST',issuedOn:'2026-11-07',
    billedTo:'SYNTHETIC OWNER',petName:'SYNTHETIC PET',
    petBreed:'SYNTHETIC BREED',status:'DRAFT',reviewOnly:true,demo:true
  },monthly);
  for(const part of [
    '@page{size:A4;margin:0}','background:#def3fc','APEX KENNELS',
    'INVOICE','Number # REVIEW-TEST','Billed To:','Boarding Time:',
    'Pet name:','Breed:','SERVICES','QTY','PRICE','AMOUNT',
    'Boarding','Grooming','Training','Pick-up &amp; Drop-off',
    'SUB TOTAL','DISCOUNT','TOTAL','30-day boarding discount',
    'Your Furry Friend Thanks You for Their Dream Vacation!'
  ])assert.ok(html.includes(part),part+' missing');
  assert.match(html,/aria-label="PKR 75,000"/);
  assert.match(html,/aria-label="PKR 10,000"/);
  assert.match(html,/aria-label="PKR 65,000"/);
  assert.match(html,/SYNTHETIC EXAMPLE · INTERNAL PREVIEW · NOT FOR CUSTOMER DELIVERY/);
  assert.doesNotMatch(html,/FATIMA SHABBIR|PK90HABB|MUHAMMAD ZAIN|Payment Details :/);
});

test('approved invoice renders only server-supplied HBL details, not any defaults',()=>{
  const html=renderInvoiceHtml({
    number:'SAMPLE-ISSUED',issuedOn:'2026-11-07',
    billedTo:'Sample Customer',petName:'Sample Dog',
    status:'APPROVED',
    bankDetails:{accountTitle:'Sample Receiver',bankName:'HBL',
      accountNumber:'000000000000',iban:'PK00TEST0000000000000000'}
  },monthly);
  assert.match(html,/Payment Details :/);
  assert.match(html,/Account Title : Sample Receiver/);
  assert.match(html,/Bank Name : HBL/);
  assert.match(html,/Account Number : 000000000000/);
  assert.match(html,/PK00TEST0000000000000000/);
  assert.doesNotMatch(html,/INTERNAL PREVIEW|SYNTHETIC EXAMPLE/);
});
test('synthetic and review-only documents reject payment details and HTML injection',()=>{
  const bankDetails={accountTitle:'<img onerror=alert(1)>',bankName:'HBL',
    iban:'PK00TEST00000000000000'};
  const view={number:'DRAFT-TEST',issuedOn:'2026-11-07',
    billedTo:'<svg onload=alert(1)>',petName:'Synthetic',status:'DRAFT' as const};
  assert.throws(()=>renderInvoiceHtml({...view,reviewOnly:true,bankDetails},monthly));
  assert.throws(()=>renderInvoiceHtml({...view,demo:true,bankDetails},monthly));
  assert.throws(()=>renderInvoiceHtml(view,monthly));
  const page=renderInvoiceHtml({...view,reviewOnly:true},monthly);
  assert.match(page,/&lt;svg onload=alert\(1\)&gt;/);
  assert.doesNotMatch(page,/<svg onload/);
});
