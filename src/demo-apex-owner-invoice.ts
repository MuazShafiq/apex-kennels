import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApexInvoiceDraft } from './apex-invoice-draft.ts';
import { renderInvoiceHtml } from './invoice.ts';

/**
 * Generates a fully synthetic internal invoice draft using confirmed boarding
 * prices. No customer DB, Forms, secrets, notifications or payment details.
 */
const draft=buildApexInvoiceDraft({
  startDate:'2026-12-01',
  endDate:'2026-12-30',
  cage:'normal',
  petCount:1,
  fullMonthPackageSelected:true,
  transport:{requested:false},
});
const html=renderInvoiceHtml({
  number:'SYNTHETIC-DRAFT-001',
  issuedOn:'2026-11-05',
  billedTo:'SYNTHETIC SAMPLE OWNER',
  petName:'SYNTHETIC SAMPLE DOG',
  petBreed:'SYNTHETIC BREED',
  status:'DRAFT',
  reviewOnly:true,
  demo:true,
},draft.quote);
const root=join(dirname(fileURLToPath(import.meta.url)),'../output');
mkdirSync(root,{recursive:true});
writeFileSync(join(root,'apex-owner-review.html'),html,'utf8');
writeFileSync(join(root,'apex-owner-review.json'),JSON.stringify(draft,null,2),'utf8');
console.log('SYNTHETIC REVIEW-ONLY. No customer data, invoice DB write or delivery.');
console.log('Open output/apex-owner-review.html in your browser to review and print to PDF.');
console.log('Synthetic monthly normal-cage booking:',draft.quote.totalPkr,'PKR.');
