/**
 * Precise overlay on the original Apex Canva A4 PDF.
 * The same PDF contains embedded, locally-subset Inter fonts. No network font
 * requests, runtime font files, HTML invoices, or automatic payment issuance.
 * Do not replace it with a different Canva export without updating geometry.
 */
import {
  PDFArray, PDFDict, PDFDocument, PDFName,
  rgb, type PDFFont, type PDFPage,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {validateSnapshot, type ReviewSnapshot} from './staff-saved-review.ts';
import type {ApprovalSnapshot} from './invoice-approval.ts';

const W=595.5, H=842.25;
const BLACK=rgb(30/255,30/255,30/255);
const GRAY=rgb(124/255,126/255,131/255);
const ALT_FONT_FILES=['Inter-Regular-Subset','Inter-Bold-Subset'] as const;
const pkr=(n:number)=>n.toLocaleString('en-PK');

function clean(value:string):string {
  if(typeof value!=='string'||value.length===0||value.length>220||
    /[\x00-\x1F\x7F]/.test(value))
    throw new Error('Invalid invoice text');
  // The embedded Inter subset is explicitly Latin-only. Do not silently render
  // tofu, skip glyphs, or invent a replacement for a customer name.
  if(/[^\u0020-\u007e\u00a0-\u00ff\u2013-\u2014\u2018-\u2019\u201c-\u201d]/u.test(value))
    throw new Error('Customer text needs a supported invoice font');
  return value.replace(/\s+/g,' ').trim();
}

function rawFontAttachment(pdf:PDFDocument,name:string):Uint8Array {
  const names=pdf.context.lookup(pdf.catalog.get(PDFName.of('Names')),PDFDict);
  if(!names)throw new Error('Canva template missing embedded fonts');
  const embedded=pdf.context.lookup(names.get(PDFName.of('EmbeddedFiles')),PDFDict);
  if(!embedded)throw new Error('Canva template missing embedded fonts');
  const entries=pdf.context.lookup(embedded.get(PDFName.of('Names')),PDFArray);
  if(!entries)throw new Error('Canva template missing font index');
  for(let i=0;i+1<entries.size();i+=2){
    const key=entries.lookup(i) as {decodeText?:()=>string}|undefined;
    if(key?.decodeText?.()!==name)continue;
    const spec=pdf.context.lookup(entries.get(i+1),PDFDict);
    if(!spec)break;
    const ef=pdf.context.lookup(spec.get(PDFName.of('EF')),PDFDict);
    if(!ef)break;
    // The bundled assets deliberately store UNCOMPRESSED OTF bytes so that
    // extraction needs no Node zlib or external services on Cloudflare Workers.
    const stream=pdf.context.lookup(ef.get(PDFName.of('F'))) as
      | {contents?:Uint8Array;dict?:PDFDict} | undefined;
    if(!stream?.contents?.length||stream.dict?.has(PDFName.of('Filter')))
      throw new Error('Canva embedded font must be an uncompressed PDF stream');
    if(stream.contents.length>800_000)throw new Error('Oversized Canva font');
    return stream.contents;
  }
  throw new Error('Canva template missing '+name);
}

function parseDate(value:string):Date {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Invalid date');
  const dt=new Date(value+'T12:00:00Z');
  if(!Number.isFinite(dt.getTime())||dt.toISOString().slice(0,10)!==value)
    throw new Error('Invalid date');
  return dt;
}
function dateLong(value:string):string {
  return new Intl.DateTimeFormat('en-US',{
    day:'numeric',month:'long',year:'numeric',timeZone:'UTC'
  }).format(parseDate(value));
}
function period(from:string,to:string):string {
  const a=parseDate(from),b=parseDate(to);
  const d=(v:Date)=>{
    const day=v.getUTCDate();
    const suffix=(day%100>=11&&day%100<=13)?'th':
      (day%10===1?'st':day%10===2?'nd':day%10===3?'rd':'th');
    return day+suffix;
  };
  const month=(v:Date,long:boolean)=>new Intl.DateTimeFormat('en-US',{
    month:long?'long':'short',timeZone:'UTC'
  }).format(v);
  if(a.getUTCFullYear()===b.getUTCFullYear()){
    if(a.getUTCMonth()===b.getUTCMonth())return d(a)+' - '+d(b)+' '+month(b,true);
    return d(a)+' '+month(a,false)+' - '+d(b)+' '+month(b,true);
  }
  return d(a)+' '+month(a,false)+' '+a.getUTCFullYear()+' - '+
    d(b)+' '+month(b,false)+' '+b.getUTCFullYear();
}

function insert(page:PDFPage,font:PDFFont,value:string,
  x:number,topBaseline:number,size=12,color=BLACK,width?:number):void {
  const v=clean(value);
  if(width!==undefined&&font.widthOfTextAtSize(v,size)>width+0.02)
    throw new Error('Invoice field would overlap the adjacent Canva field');
  // Canva's MediaBox starts at y=7.83, not 0: measure from the real top edge
  // (850.08pt), or every value lands 7.83pt low and overlaps the labels.
  const box=page.getMediaBox();
  page.drawText(v,{x,y:box.y+box.height-topBaseline,size,font,color});
}
function insertRight(page:PDFPage,font:PDFFont,value:string,
  right:number,baseline:number,size=12,maxWidth=86,color=BLACK):void {
  const v=clean(value);
  const width=font.widthOfTextAtSize(v,size);
  if(width>maxWidth+0.02)throw new Error('Invoice numeric field exceeds Canva column');
  insert(page,font,v,right-width,baseline,size,color,maxWidth);
}

/**
 * Layout is deliberately bounded: the next label begins at top y=254.118pt.
 * The two-line upper values must end above that, never overlap it.
 */
export function layoutCanvaValue(value:string,font:PDFFont,width:number,upper:boolean):{
  text:string;size:number;baseline:number
}[] {
  const text=clean(value);
  if(font.widthOfTextAtSize(text,12)<=width)
    return [{text,size:12,baseline:upper?242.355:280.62}];
  const words=text.split(' ');
  if(words.length<2)throw new Error('Unbreakable invoice identity field');
  for(const size of [11,10.5,10,9.5,9,8.75]){
    let best:{a:string;b:string;balance:number}|null=null;
    for(let split=1;split<words.length;split++){
      const a=words.slice(0,split).join(' '),b=words.slice(split).join(' ');
      const aw=font.widthOfTextAtSize(a,size);
      const bw=font.widthOfTextAtSize(b,size);
      if(aw>width||bw>width)continue;
      const balance=Math.abs(aw-bw);
      if(!best||balance<best.balance)best={a,b,balance};
    }
    if(best)return [
      {text:best.a,size,baseline:upper?238.7:277.0},
      {text:best.b,size,baseline:upper?249.8:288.1},
    ];
  }
  throw new Error('Invoice identity field does not fit the original Canva cell');
}
function identity(page:PDFPage,font:PDFFont,value:string,x:number,width:number,upper:boolean):void {
  for(const line of layoutCanvaValue(value,font,width,upper))
    insert(page,font,line.text,x,line.baseline,line.size,BLACK,width);
}

/**
 * Future issued-invoice helper. The blank template contains the IBAN label;
 * the customer account may ONLY be added to a separately approved invoice.
 */
export function drawCanvaIbanSingleLine(page:PDFPage,font:PDFFont,iban:string):void {
  const normalized=iban.replace(/[ -]/g,'').toUpperCase();
  if(!/^PK[0-9]{2}[A-Z0-9]{20}$/.test(normalized))
    throw new Error('Expected one valid-format 24-character Pakistan IBAN');
  insert(page,font,normalized,130,685.453,10,BLACK,216);
}

/** Printable owner-only PDF; no official number, bank data, approval or sending. */
export async function renderCanvaStaffPdf(
  input:ReviewSnapshot,reviewDate:string,blankPdf:Uint8Array
):Promise<Uint8Array> {
  return renderCanvaPdf(input,reviewDate,blankPdf);
}

/** Render only the frozen approved values. Issuance stores these bytes once. */
export async function renderCanvaApprovedPdf(
  approved:ApprovalSnapshot,blankPdf:Uint8Array
):Promise<Uint8Array> {
  if(approved.version!==1||!/^\d{4}$/.test(approved.invoiceNumber)||
     !Number.isSafeInteger(approved.reviewRevision)||approved.reviewRevision<1||
     !approved.approvedBy||!Number.isFinite(Date.parse(approved.approvedAt))||
     approved.review.booking.synthetic||
     (approved.review.transport&&(!approved.transportVerified||!approved.fuelVerified))||
     approved.payment?.bank!=='HBL'||!approved.payment.accountTitle||
     !/^[0-9]{8,24}$/.test(approved.payment.accountNumber)||
     !/^PK[0-9]{2}HABB[A-Z0-9]{16}$/.test(approved.payment.iban))
    throw new Error('Invalid approved invoice snapshot');
  return renderCanvaPdf(approved.review,approved.approvedAt.slice(0,10),blankPdf,approved);
}

async function renderCanvaPdf(
  input:ReviewSnapshot,reviewDate:string,blankPdf:Uint8Array,approved?:ApprovalSnapshot
):Promise<Uint8Array> {
  const snapshot=validateSnapshot(input),q=snapshot.quote;
  if(q.currency!=='PKR'||q.billedDays<1||q.lines.length===0||
    !q.lines.every(l=>Number.isSafeInteger(l.totalPkr)&&l.totalPkr===l.quantity*l.unitPricePkr)||
    q.lines.reduce((s,l)=>s+l.totalPkr,0)!==q.subtotalPkr||
    q.subtotalPkr-q.discounts.reduce((s,d)=>s+d.amountPkr,0)!==q.totalPkr)
    throw new Error('Invalid invoice review totals');
  const boarding=q.lines.filter(l=>/^(Standard|Camera cage) boarding$/i.test(l.label));
  const extras=q.lines.filter(l=>!/^(Standard|Camera cage) boarding$/i.test(l.label));
  const transport=extras.filter(l=>l.label==='Pet transport');
  const other=extras.filter(l=>l.label!=='Pet transport');
  if(boarding.length!==1||transport.length>1||
     transport.some(l=>l.quantity!==1||l.unitPricePkr<=0||l.totalPkr!==l.unitPricePkr)||
     other.some(l=>l.totalPkr!==0||!/grooming/i.test(l.label))||
     (transport.length===1&&!snapshot.transport))
    throw new Error('Canva staff PDF cannot represent unverified priced extras');
  const line=boarding[0],pets=line.quantity/q.billedDays;
  if(!Number.isSafeInteger(pets)||pets<1)throw new Error('Invalid pet quantity');
  const pdf=await PDFDocument.load(blankPdf,{ignoreEncryption:false});
  if(pdf.getPageCount()!==2)throw new Error('Unexpected Canva invoice template variants');
  const discount=q.discounts.reduce((s,d)=>s+d.amountPkr,0);
  // Page 1 is the original Canva discount layout. Page 2 is its authentic
  // no-discount sibling, with the old DISCOUNT artwork physically removed.
  // Take the kept page BEFORE removing its sibling: pdf-lib 1.17.1 keeps a
  // stale page cache, so getPage(0) after removePage(0) returns the REMOVED
  // page and every drawn value is silently discarded from the saved PDF.
  const keep=discount===0?1:0;
  const page=pdf.getPage(keep);
  pdf.removePage(1-keep);
  if(pdf.getPageCount()!==1)throw new Error('Unexpected Canva invoice page count');
  if(Math.abs(page.getWidth()-W)>.2||Math.abs(page.getHeight()-H)>.2)
    throw new Error('Canva invoice template size changed');
  pdf.registerFontkit(fontkit);
  const regular=await pdf.embedFont(rawFontAttachment(pdf,ALT_FONT_FILES[0]),{subset:true});
  const bold=await pdf.embedFont(rawFontAttachment(pdf,ALT_FONT_FILES[1]),{subset:true});
  const b=snapshot.booking;
  const no=clean(approved?.invoiceNumber??('REVIEW-'+b.id.slice(0,8).toUpperCase()));
  insert(page,regular,'Number # '+no,54.2455,267.663,10,BLACK,191);
  insert(page,regular,dateLong(reviewDate),86,281.17,10,BLACK,157);
  identity(page,bold,b.customerName,264.9975,151,true);
  identity(page,bold,b.petNames,428.7533,103,true);
  identity(page,bold,period(b.startDate,b.endDate),264.9975,159,false);
  if(b.petBreeds)identity(page,bold,b.petBreeds,428.7533,103,false);
  if(/camera cage/i.test(line.label))insert(page,regular,' - camera cage',117.8,396.115,12,BLACK,157);

  insertRight(page,regular,q.billedDays+' days'+(pets>1?' x '+pets+' dogs':''),
    349.56,396.115,12,86);
  insertRight(page,regular,String(line.unitPricePkr),439.11,396.115);
  insertRight(page,regular,pkr(line.totalPkr),520.88,396.115);
  for(const [baseline,value] of [[435.130,'free'],[474.273,'-']] as const)
    for(const x of [349.56,439.11,520.88])insertRight(page,regular,value,x,baseline);
  // The fourth row is labelled "Pick-up & Drop-off" on Fatima's original Canva artwork.
  // A combined transport service is sold as one reviewed service, so quantity is 1
  // even if it contains two separately routed round trips.
  const tripLine=transport[0];
  if(tripLine){
    insertRight(page,regular,'1',349.56,513.288);
    insertRight(page,regular,pkr(tripLine.unitPricePkr),439.11,513.288);
    insertRight(page,regular,pkr(tripLine.totalPkr),520.88,513.288);
  }else for(const x of [349.56,439.11,520.88])
    insertRight(page,regular,'-',x,513.288);

  insertRight(page,regular,pkr(q.subtotalPkr),520.88,630.232);
  if(discount===0)insertRight(page,bold,pkr(q.totalPkr),520.88,669.247);
  else {
    insertRight(page,regular,pkr(discount),520.88,669.247);
    insertRight(page,bold,pkr(q.totalPkr),520.88,709.012);
  }
  if(b.synthetic)
    insert(page,bold,'SYNTHETIC EXAMPLE',54.2455,321,8,GRAY,150);
  if(approved){
    // Keep the payment block within the original left column, clear of totals.
    insert(page,regular,approved.payment.accountTitle,130,658.443,10,BLACK,216);
    insert(page,regular,approved.payment.accountNumber,146,671.948,10,BLACK,200);
    drawCanvaIbanSingleLine(page,regular,approved.payment.iban);
    insert(page,regular,approved.payment.bank,120,698.958,10,BLACK,226);
  }else{
    insert(page,bold,'INTERNAL / NOT PAYABLE',54.2455,307,9,GRAY,200);
  }
  pdf.setTitle(approved?'Apex Kennels | Invoice '+approved.invoiceNumber:
    b.synthetic?'Apex Kennels | Synthetic preview':'Apex Kennels | Staff review');
  pdf.setAuthor('Apex Kennels');
  pdf.setSubject(approved?'Approved invoice; payment status is not tracked':
    'Internal booking estimate; not an issued invoice');
  return pdf.save({useObjectStreams:false});
}
