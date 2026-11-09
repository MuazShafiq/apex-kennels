import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument, StandardFonts} from 'pdf-lib';
import {
  renderCanvaStaffPdf,drawCanvaIbanSingleLine,layoutCanvaValue
} from './canva-invoice-pdf.ts';
import type {ReviewSnapshot} from './staff-saved-review.ts';
import {parseNotifiedPetrolRate} from './islamabad-petrol-rate.ts';

const blank=readFileSync('public/invoice/canva-blank.pdf');
const sample:ReviewSnapshot={
  version:1,
  booking:{id:'cb5e767c-7170-40a1-ae63-08a5f4eac5bc',
    customerName:'APEX CANARY 50847836-445',petNames:'APEX SYNTHETIC CANARY PET',
    petBreeds:'APEX SYNTHETIC CANARY BREED',
    startDate:'2026-11-10',endDate:'2026-11-12',synthetic:true},
  packageChoice:'daily',rateVersion:'fatima-confirmed-2026-11-06',
  quote:{currency:'PKR',startDate:'2026-11-10',endDate:'2026-11-12',billedDays:3,
    lines:[{label:'Standard boarding',quantity:3,unitPricePkr:2500,totalPkr:7500}],
    discounts:[],subtotalPkr:7500,totalPkr:7500}
};

test('template contains original and no-discount Canva artwork, not a reconstructed HTML page',async()=>{
  const pdf=await PDFDocument.load(blank);
  assert.equal(pdf.getPageCount(),2);
  for(const page of pdf.getPages()){
    assert.ok(Math.abs(page.getWidth()-595.5)<.1);
    assert.ok(Math.abs(page.getHeight()-842.25)<.1);
  }
});

test('real synthetic canary renders as one-page, authentic-font Canva PDF',async()=>{
  const bytes=await renderCanvaStaffPdf(sample,'2026-11-07',blank);
  const pdf=await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(),1);
  assert.match(pdf.getSubject()??'',/not an issued invoice/);
  assert.match(pdf.getTitle()??'',/Synthetic preview/);
  assert.ok(bytes.length>5000);
});

test('30-day discount uses the original three-row Canva totals layout',async()=>{
  const monthly=structuredClone(sample);
  monthly.booking.startDate='2026-11-01';monthly.booking.endDate='2026-11-30';
  monthly.quote.startDate='2026-11-01';monthly.quote.endDate='2026-11-30';
  monthly.quote.billedDays=30;
  monthly.quote.lines[0]={label:'Standard boarding',quantity:30,unitPricePkr:2500,totalPkr:75000};
  monthly.quote.subtotalPkr=75000;
  monthly.quote.discounts=[{source:'package',label:'30-day boarding discount',amountPkr:10000}];
  monthly.quote.totalPkr=65000;
  const bytes=await renderCanvaStaffPdf(monthly,'2026-11-07',blank);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);
});

test('identity lines obey the fixed Canva columns and never cross the next label',async()=>{
  const pdf=await PDFDocument.create();
  const font=await pdf.embedFont(StandardFonts.HelveticaBold);
  for(const [text,width,upper] of [
    ['APEX CANARY 50847836-445',151,true],
    ['APEX SYNTHETIC CANARY PET',103,true],
    ['APEX SYNTHETIC CANARY BREED',103,false],
  ] as const){
    const rows=layoutCanvaValue(text,font,width,upper);
    assert.ok(rows.length>=1&&rows.length<=2);
    for(const row of rows){
      assert.ok(font.widthOfTextAtSize(row.text,row.size)<=width);
      if(upper)assert.ok(row.baseline<=249.8);
    }
  }
  assert.throws(()=>layoutCanvaValue('A'.repeat(200),font,103,true),
    /Unbreakable invoice identity field/);
});

test('Canva fourth service row accepts priced transport with frozen route and fuel evidence',async()=>{
  const changed=structuredClone(sample);
  const amount=1409;
  changed.quote.lines.push({label:'Pet transport',quantity:1,unitPricePkr:amount,totalPkr:amount});
  changed.quote.subtotalPkr+=amount;changed.quote.totalPkr+=amount;
  const fuel=parseNotifiedPetrolRate({effectiveDate:'2026-11-05',
    products:[{product:'Motor Spirit (Petrol)',pricePkr:362,unit:'litre'}]},
    {now:new Date('2026-11-05T12:00:00Z'),sourceUrl:'https://oilprices.pk/api/latest'});
  changed.transport={
    route:{status:'ROUTE_REVIEW_REQUIRED',provider:'Geoapify Routing',
      routeType:'kennel_access_customer_access_kennel',
      loopDistanceKm:19.45,plannedRoundTrips:2,totalDrivenKm:38.9,
      retrievedAt:'2026-11-05T12:00:00Z',
      kennelPin:{lat:33.2992325,lon:73.2534561},
      kennelAccessWaypoint:{lat:33.31392,lon:73.25810},
      customerPin:{lat:33.70,lon:73.08},needsStaffConfirmation:true},
    fuelRate:fuel
  };
  const pdf=await PDFDocument.load(await renderCanvaStaffPdf(changed,'2026-11-07',blank));
  assert.equal(pdf.getPageCount(),1);
  assert.match(pdf.getSubject()??'',/not an issued invoice/);
});
test('rejects priced transport without verified provenance and unsupported extras',async()=>{
  const changed=structuredClone(sample);
  changed.quote.lines.push({label:'Pet transport',quantity:1,unitPricePkr:4000,totalPkr:4000});
  changed.quote.subtotalPkr=11500;changed.quote.totalPkr=11500;
  await assert.rejects(renderCanvaStaffPdf(changed,'2026-11-07',blank),/transport estimate lacks route or fuel evidence/);
  changed.quote.lines[1].label='Unknown extra charge';
  await assert.rejects(renderCanvaStaffPdf(changed,'2026-11-07',blank),/unverified priced extras/);
});

test('IBAN helper never wraps or accepts malformed bank details',async()=>{
  const pdf=await PDFDocument.create();
  const page=pdf.addPage([595.5,842.25]);
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  assert.doesNotThrow(()=>drawCanvaIbanSingleLine(page,font,'PK90 HABB 0013537902027603'));
  assert.throws(()=>drawCanvaIbanSingleLine(page,font,'PK90HABB0013537902027603 other line'),
    /valid-format 24-character Pakistan IBAN/);
});
