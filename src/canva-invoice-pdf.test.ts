import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFArray, PDFDict, PDFDocument, PDFName, type PDFRawStream, StandardFonts} from 'pdf-lib';
import {inflateSync} from 'node:zlib';
import {
  renderCanvaStaffPdf,renderCanvaApprovedPdf,drawCanvaIbanSingleLine,layoutCanvaValue
} from './canva-invoice-pdf.ts';
import type {ReviewSnapshot} from './staff-saved-review.ts';
import {handleWorkerRequest} from './cloudflare-worker.ts';
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

test('public synthetic invoice route serves one-page Canva PDF, not HTML',async()=>{
  const response=await handleWorkerRequest(
    new Request('https://example.workers.dev/demo/invoice'),
    {ASSETS:{fetch:async()=>new Response(blank,{headers:{'Content-Type':'application/pdf'}})}}
  );
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type')??'',/^application\/pdf/);
  assert.match(response.headers.get('content-disposition')??'',/^inline;/);
  assert.match(response.headers.get('cache-control')??'',/no-store/);
  const bytes=new Uint8Array(await response.arrayBuffer());
  assert.equal(new TextDecoder('ascii').decode(bytes.subarray(0,5)),'%PDF-');
  const pdf=await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(),1);
  assert.match(pdf.getTitle()??'',/Synthetic preview/i);
  assert.match(pdf.getSubject()??'',/not an issued invoice/i);
});

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

/** Count text-showing operators on the single saved page (our overlay values). */
async function savedPageTextOps(bytes:Uint8Array):Promise<number>{
  const pdf=await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(),1);
  const page=pdf.getPage(0);
  const contents=pdf.context.lookup(page.node.get(PDFName.of('Contents')));
  const refs=contents instanceof PDFArray?contents.asArray():[page.node.get(PDFName.of('Contents'))];
  let ops=0;
  for(const ref of refs){
    const stream=pdf.context.lookup(ref) as PDFRawStream;
    const filter=String(stream.dict.get(PDFName.of('Filter'))??'');
    const raw=filter.includes('FlateDecode')?inflateSync(stream.contents):stream.contents;
    ops+=(Buffer.from(raw).toString('latin1').match(/\b(Tj|TJ)\b/g)??[]).length;
  }
  return ops;
}

test('drawn values survive on the kept page for daily and 30-day layouts',async()=>{
  // Regression: removePage(0) then getPage(0) drew every value onto the
  // removed page, so daily estimates saved as a blank Canva template.
  const templateOps=await (async()=>{
    const pdf=await PDFDocument.load(blank);pdf.removePage(0);
    return savedPageTextOps(await pdf.save({useObjectStreams:false}));
  })();
  const daily=await savedPageTextOps(await renderCanvaStaffPdf(sample,'2026-11-07',blank));
  // Number, date, name, pet, period, breed, 3 boarding cells, 6 free/- cells,
  // 3 transport '-' cells, subtotal, total and the synthetic label.
  assert.ok(daily-templateOps>=20,`daily overlay drew ${daily-templateOps} text runs`);
  const monthly=structuredClone(sample);
  monthly.booking.startDate='2026-11-01';monthly.booking.endDate='2026-11-30';
  monthly.quote.startDate='2026-11-01';monthly.quote.endDate='2026-11-30';
  monthly.quote.billedDays=30;
  monthly.quote.lines[0]={label:'Standard boarding',quantity:30,unitPricePkr:2500,totalPkr:75000};
  monthly.quote.subtotalPkr=75000;
  monthly.quote.discounts=[{source:'package',label:'30-day boarding discount',amountPkr:10000}];
  monthly.quote.totalPkr=65000;
  const monthlyTemplateOps=await (async()=>{
    const pdf=await PDFDocument.load(blank);pdf.removePage(1);
    return savedPageTextOps(await pdf.save({useObjectStreams:false}));
  })();
  const monthlyOps=await savedPageTextOps(await renderCanvaStaffPdf(monthly,'2026-11-07',blank));
  assert.ok(monthlyOps-monthlyTemplateOps>=20,`monthly overlay drew ${monthlyOps-monthlyTemplateOps} text runs`);
});

test('values are positioned from the Canva MediaBox top edge, not y=0',async()=>{
  // The template MediaBox is [0 7.83 595.5 850.08]. Measuring from 842.25
  // put every value 7.83pt low, overlapping "Date :" and "Boarding Time:".
  const pdf=await PDFDocument.load(await renderCanvaStaffPdf(sample,'2026-11-07',blank));
  const page=pdf.getPage(0);
  const box=page.getMediaBox();
  assert.ok(Math.abs(box.y+box.height-850.08)<.01);
  const contents=pdf.context.lookup(page.node.get(PDFName.of('Contents'))) as PDFArray;
  const ys:number[]=[];
  for(const ref of contents.asArray()){
    const stream=pdf.context.lookup(ref) as PDFRawStream;
    const filter=String(stream.dict.get(PDFName.of('Filter'))??'');
    const raw=Buffer.from(filter.includes('FlateDecode')?inflateSync(stream.contents):stream.contents).toString('latin1');
    for(const m of raw.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g))ys.push(Number(m[2]));
  }
  // "Number # ..." baseline 267.663pt below the real top edge.
  assert.ok(ys.some(y=>Math.abs(y-(850.07998-267.663))<.01),'Number line at Canva baseline');
  assert.ok(!ys.some(y=>Math.abs(y-(842.25-267.663))<.01),'not offset by the MediaBox origin');
});

/** Decode actual saved overlay text via its embedded font's ToUnicode map. */
async function savedText(bytes:Uint8Array):Promise<{text:string;x:number;y:number}[]> {
  const pdf=await PDFDocument.load(bytes),page=pdf.getPage(0);
  const fonts=page.node.Resources()!.lookup(PDFName.of('Font'),PDFDict);
  const maps=new Map<string,Map<string,string>>();
  const streamText=(stream:PDFRawStream)=>Buffer.from(
    String(stream.dict.get(PDFName.of('Filter'))??'').includes('FlateDecode')?
      inflateSync(stream.contents):stream.contents).toString('latin1');
  for(const [key,ref] of fonts.entries()){
    const font=pdf.context.lookup(ref,PDFDict);
    const unicode=font.lookup(PDFName.of('ToUnicode')) as PDFRawStream|undefined;
    if(!unicode)continue;
    const map=new Map<string,string>();
    const cmap=streamText(unicode);
    for(const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
      for(const m of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)){
        const units=m[2].match(/.{4}/g)??[];
        map.set(m[1].toUpperCase(),String.fromCharCode(...units.map(x=>parseInt(x,16))));
      }
    maps.set(key.toString().slice(1),map);
  }
  const contents=page.node.Contents();
  const streams=contents instanceof PDFArray?contents.asArray():[contents];
  const result:{text:string;x:number;y:number}[]=[];
  for(const ref of streams){
    const raw=streamText(pdf.context.lookup(ref) as PDFRawStream);
    let font='',x=0,y=0;
    for(const m of raw.matchAll(/\/([^\s]+) [\d.]+ Tf|1 0 0 1 ([\d.]+) ([\d.]+) Tm|<([0-9A-Fa-f]+)> Tj/g)){
      if(m[1])font=m[1];
      else if(m[2]){x=Number(m[2]);y=Number(m[3]);}
      else if(m[4]){
        const map=maps.get(font);
        if(map)result.push({text:(m[4].match(/.{4}/g)??[]).map(c=>map.get(c.toUpperCase())??'?').join(''),x,y});
      }
    }
  }
  return result;
}

const approvedSample=()=>({
  version:1 as const,review:{...structuredClone(sample),booking:{...sample.booking,
    customerName:'Synthetic PDF Fixture',petNames:'Test Pet',petBreeds:'Test Breed',synthetic:false}},
  reviewRevision:2,invoiceNumber:'0123',approvedBy:'owner@example.test',
  approvedAt:'2026-11-07T12:00:00.000Z',payment:{bank:'HBL' as const,
    accountTitle:'TEST ACCOUNT ONLY',accountNumber:'00000000000000',iban:'PK00HABB0000000000000000'},
  transportVerified:false,fuelVerified:false,deliveryRequested:false
});

test('approved PDF contains exact frozen money, number and payment at original Canva baselines',async()=>{
  const snapshot=approvedSample();
  const before=structuredClone(snapshot);
  const bytes=await renderCanvaApprovedPdf(snapshot,blank);
  assert.deepEqual(snapshot,before,'renderer does not mutate frozen snapshot');
  const pdf=await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(),1);
  const rows=await savedText(bytes);
  for(const [text,x,baseline] of [
    ['Number # 0123',54.2455,267.663],['TEST ACCOUNT ONLY',130,658.443],
    ['00000000000000',146,671.948],['PK00HABB0000000000000000',130,685.453],
    ['HBL',120,698.958],['7,500',undefined,669.247]
  ] as const){
    assert.ok(rows.some(r=>r.text===text&&(x===undefined||Math.abs(r.x-x)<.01)&&
      Math.abs(r.y-(850.07998-baseline))<.02),`saved text and baseline: ${text}`);
  }
  assert.ok(!rows.some(r=>/REVIEW-|NOT PAYABLE|SYNTHETIC EXAMPLE/.test(r.text)));
  assert.ok(!rows.some(r=>r.text.includes(snapshot.approvedBy)),'no internal approver identity in customer PDF');
});

test('review PDF visibly says not payable and never contains bank or official invoice values',async()=>{
  const rows=await savedText(await renderCanvaStaffPdf(sample,'2026-11-07',blank));
  assert.ok(rows.some(r=>r.text==='INTERNAL / NOT PAYABLE'));
  assert.ok(rows.some(r=>r.text.startsWith('Number # REVIEW-')));
  assert.ok(!rows.some(r=>r.text==='TEST ACCOUNT ONLY'||r.text.startsWith('PK00HABB')));
});

test('approved PDF rejects synthetic records, malformed payment and invalid invoice numbers',async()=>{
  const snapshot=approvedSample();
  snapshot.review.booking.synthetic=true;
  await assert.rejects(renderCanvaApprovedPdf(snapshot,blank),/Invalid approved/);
  snapshot.review.booking.synthetic=false;
  snapshot.payment.iban='PK00OTHER0000000000000000';
  await assert.rejects(renderCanvaApprovedPdf(snapshot,blank),/Invalid approved/);
  snapshot.payment.iban='PK00HABB0000000000000000';
  snapshot.invoiceNumber='12345';
  await assert.rejects(renderCanvaApprovedPdf(snapshot,blank),/Invalid approved/);
});


test('approved monthly PDF preserves exact package discount and distinct total baseline',async()=>{
  const approved=approvedSample(),s=approved.review;
  s.packageChoice='monthly';
  s.booking.startDate='2026-11-01';s.booking.endDate='2026-11-30';
  s.quote.startDate=s.booking.startDate;s.quote.endDate=s.booking.endDate;
  s.quote.billedDays=30;
  s.quote.lines[0]={label:'Standard boarding',quantity:30,unitPricePkr:2500,totalPkr:75000};
  s.quote.subtotalPkr=75000;s.quote.totalPkr=65000;
  s.quote.discounts=[{source:'package',label:'30-day boarding discount',amountPkr:10000}];
  const rows=await savedText(await renderCanvaApprovedPdf(approved,blank));
  for(const [text,baseline] of [['75,000',630.232],['10,000',669.247],['65,000',709.012]] as const)
    assert.ok(rows.some(r=>r.text===text&&Math.abs(r.y-(850.07998-baseline))<.02),
      `frozen package money at original baseline: ${text}`);
});
