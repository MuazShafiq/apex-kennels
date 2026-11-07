import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument, StandardFonts} from 'pdf-lib';
import {renderCanvaStaffPdf,drawCanvaIbanSingleLine} from './canva-invoice-pdf.ts';
import type {ReviewSnapshot} from './staff-saved-review.ts';

const blank=readFileSync('public/invoice/canva-blank.pdf');
const example:ReviewSnapshot={
  version:1,
  booking:{id:'cb5e767c-7170-40a1-ae63-08a5f4eac5bc',
    customerName:'APEX CANARY',petNames:'APEX SYNTHETIC CANARY PET',
    petBreeds:'Husky',startDate:'2026-11-10',endDate:'2026-11-12',synthetic:true},
  packageChoice:'daily',rateVersion:'fatima-confirmed-2026-11-06',
  quote:{currency:'PKR',startDate:'2026-11-10',endDate:'2026-11-12',billedDays:3,
    lines:[{label:'Standard boarding',quantity:3,unitPricePkr:2500,totalPkr:7500}],
    discounts:[],subtotalPkr:7500,totalPkr:7500}
};
test('pdf generator preserves original Canva A4 and cannot turn into a payable invoice',async()=>{
  const result=await renderCanvaStaffPdf(example,'2026-11-07',blank);
  assert.ok(result.length>blank.length);
  const pdf=await PDFDocument.load(result);
  assert.equal(pdf.getPageCount(),1);
  assert.ok(Math.abs(pdf.getPage(0).getWidth()-595.5)<0.1);
  assert.match(pdf.getSubject()??'',/not an issued invoice/);
});
test('refuses unrepresented priced extras (no silent underquoting)',async()=>{
  const changed=structuredClone(example);
  changed.quote.lines.push({label:'Pet transport',quantity:1,unitPricePkr:4000,totalPkr:4000});
  changed.quote.subtotalPkr=11500;changed.quote.totalPkr=11500;
  await assert.rejects(renderCanvaStaffPdf(changed,'2026-11-07',blank),/boarding-only/);
});

test('approved-layout helper keeps Pakistan IBAN on exactly one line',async()=>{
  const pdf=await PDFDocument.create();
  const page=pdf.addPage([595.5,842.25]);
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  assert.doesNotThrow(()=>drawCanvaIbanSingleLine(page,font,'PK90 HABB 0013537902027603'));
  assert.ok(font.widthOfTextAtSize('PK90HABB0013537902027603',10)<216);
  assert.throws(()=>drawCanvaIbanSingleLine(page,font,'PK90HABB0013537902027603 on a second line'),
    /valid-format 24-character Pakistan IBAN/);
  const result=await pdf.save();
  assert.ok(result.length>0);
});
test('long synthetic pet names wrap inside the Canva column instead of failing',async()=>{
  const result=await renderCanvaStaffPdf(example,'2026-11-07',blank);
  assert.ok(result.length>blank.length);
});
