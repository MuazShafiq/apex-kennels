/**
 * Apex Kennels Canva PDF overlay.
 * This uses Fatima's original blank Canva export, never a redrawn document.
 * Only non-payable STAFF reviews are supported by this entry point.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { validateSnapshot, type ReviewSnapshot } from './staff-saved-review.ts';

const BLACK = rgb(0.1, 0.1, 0.1);
const WARNING = rgb(0.54, 0.28, 0.12);
const TEMPLATE_WIDTH=595.5;
const TEMPLATE_HEIGHT=842.25;

const money=(n:number):string=>n.toLocaleString('en-PK');
function readableDate(raw:string):string {
  const date=new Date(`${raw}T12:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||Number.isNaN(date.getTime())||
     date.toISOString().slice(0,10)!==raw)throw new Error('Invalid invoice date');
  return new Intl.DateTimeFormat('en-US',{
    timeZone:'UTC',month:'long',day:'numeric',year:'numeric'
  }).format(date);
}
function shortDate(raw:string):string {
  const date=new Date(`${raw}T12:00:00Z`);
  if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==raw)
    throw new Error('Invalid boarding date');
  const day=date.getUTCDate();
  const suffix=(day%100>=11&&day%100<=13)?'th':
    ({1:'st',2:'nd',3:'rd'} as Record<number,string>)[day%10]??'th';
  const month=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short'}).format(date);
  return `${day}${suffix} ${month}`;
}
function boardingPeriod(from:string,to:string):string {
  const a=new Date(`${from}T12:00:00Z`);
  const b=new Date(`${to}T12:00:00Z`);
  const suffix=(day:number)=>(day%100>=11&&day%100<=13)?'th':
    ({1:'st',2:'nd',3:'rd'} as Record<number,string>)[day%10]??'th';
  const d=(date:Date)=>`${date.getUTCDate()}${suffix(date.getUTCDate())}`;
  const month=(date:Date,long:boolean)=>new Intl.DateTimeFormat('en-US',{
    timeZone:'UTC',month:long?'long':'short'
  }).format(date);
  if(a.getUTCFullYear()===b.getUTCFullYear()){
    if(a.getUTCMonth()===b.getUTCMonth())return `${d(a)} - ${d(b)} ${month(b,true)}`;
    return `${d(a)} ${month(a,false)} - ${d(b)} ${month(b,true)}`;
  }
  return `${shortDate(from)} ${a.getUTCFullYear()} - ${shortDate(to)} ${b.getUTCFullYear()}`;
}

function add(page:PDFPage,font:PDFFont,regular:PDFFont,value:string,
  x:number,baselineTop:number,opts:{size?:number;maxWidth?:number;right?:number;warning?:boolean}={}):void {
  const limit=opts.maxWidth??(opts.right===undefined?undefined:opts.right-x);
  let size=opts.size??12;
  if(!value||/[\x00-\x08\x0E-\x1F]/.test(value)||value.length>220)
    throw new Error('Invalid PDF invoice field');
  while(limit!==undefined&&font.widthOfTextAtSize(value,size)>limit&&size>=7.75)size-=0.25;
  if(limit!==undefined&&font.widthOfTextAtSize(value,size)>limit)
    throw new Error('Invoice field does not fit the Canva layout');
  const finalX=opts.right===undefined?x:opts.right-font.widthOfTextAtSize(value,size);
  page.drawText(value,{x:finalX,y:page.getHeight()-baselineTop,size,font,color:opts.warning?WARNING:BLACK});
  void regular;
}

/**
 * Reserved for the future, separately approved invoice-issuance workflow.
 * PDF artwork already prints "IBAN Number :" at this position; keep the
 * complete Pakistani IBAN beside that label on ONE line, never below it.
 * Deliberately not used by renderCanvaStaffPdf (staff drafts have no banking).
 */
export function drawCanvaIbanSingleLine(page:PDFPage,font:PDFFont,iban:string):void {
  const normalized=iban.replace(/[ -]/g,'').toUpperCase();
  if(!/^PK[0-9]{2}[A-Z0-9]{20}$/.test(normalized))
    throw new Error('Expected one valid-format 24-character Pakistan IBAN');
  const x=130,baselineTop=685.453,size=10,maxWidth=216;
  if(font.widthOfTextAtSize(normalized,size)>maxWidth)
    throw new Error('IBAN cannot fit on one Canva line');
  page.drawText(normalized,{x,y:page.getHeight()-baselineTop,size,font,color:BLACK});
}

/** Fit ordinary values, but wrap unusually long names within their own cell. */
function addIdentityField(page:PDFPage,font:PDFFont,regular:PDFFont,value:string,
  x:number,baselineTop:number,width:number):void {
  if(!value||/[\x00-\x08\x0E-\x1F]/.test(value)||value.length>220)
    throw new Error('Invalid PDF invoice field');
  if(font.widthOfTextAtSize(value,9.5)<=width){
    add(page,font,regular,value,x,baselineTop,{size:12,maxWidth:width});
    return;
  }
  const words=value.trim().split(/\s+/);
  if(words.length<2)throw new Error('Invoice field does not fit Canva identity column');
  // The upper identity row ends where the next blue label begins (y=254pt).
  // Use compact two-line typography there instead of colliding with the label.
  const isUpperRow=baselineTop<260;
  for(let size=isUpperRow?9:11.5;size>=8.5;size-=0.5){
    let best:[string,string]|null=null;
    let bestDifference=Infinity;
    for(let i=1;i<words.length;i++){
      const a=words.slice(0,i).join(' '),b=words.slice(i).join(' ');
      const aw=font.widthOfTextAtSize(a,size),bw=font.widthOfTextAtSize(b,size);
      if(aw<=width&&bw<=width&&Math.abs(aw-bw)<bestDifference){
        best=[a,b];bestDifference=Math.abs(aw-bw);
      }
    }
    if(best){
      add(page,font,regular,best[0],x,baselineTop,{size,maxWidth:width});
      add(page,font,regular,best[1],x,baselineTop+
        (isUpperRow?9:Math.max(11.5,size+0.8)),{size,maxWidth:width});
      return;
    }
  }
  throw new Error('Invoice field needs staff correction: cannot fit two Canva lines');
}

export async function renderCanvaStaffPdf(
  input:ReviewSnapshot,reviewDate:string,blankPdf:Uint8Array
):Promise<Uint8Array> {
  const snapshot=validateSnapshot(input);
  const q=snapshot.quote;
  if(q.currency!=='PKR'||q.billedDays<1||q.lines.length===0||
     !q.lines.every(l=>Number.isSafeInteger(l.totalPkr)&&l.totalPkr===l.quantity*l.unitPricePkr)||
     q.lines.reduce((s,l)=>s+l.totalPkr,0)!==q.subtotalPkr||
     q.subtotalPkr-q.discounts.reduce((s,d)=>s+d.amountPkr,0)!==q.totalPkr)
    throw new Error('Invalid saved review amounts');
  const boarding=q.lines.filter(l=>/^(Standard|Camera cage) boarding$/i.test(l.label));
  const extras=q.lines.filter(l=>!/^(Standard|Camera cage) boarding$/i.test(l.label));
  if(boarding.length!==1||extras.some(l=>l.totalPkr!==0||!/grooming/i.test(l.label)))
    throw new Error('Canva staff PDF supports boarding-only reviews; do not omit priced extras');
  const line=boarding[0];
  if(line.quantity%q.billedDays!==0||line.quantity<q.billedDays)
    throw new Error('Invalid boarding quantity');
  const pets=line.quantity/q.billedDays;
  const pdf=await PDFDocument.load(blankPdf,{ignoreEncryption:false});
  if(pdf.getPageCount()!==1)throw new Error('Unexpected Canva invoice template');
  const page=pdf.getPage(0);
  if(Math.abs(page.getWidth()-TEMPLATE_WIDTH)>0.6||Math.abs(page.getHeight()-TEMPLATE_HEIGHT)>0.6)
    throw new Error('Canva invoice template dimensions changed');
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const put=(value:string,x:number,y:number,size=12,heavy=false,maxWidth?:number)=>
    add(page,heavy?bold:regular,regular,value,x,y,{size,maxWidth});
  const right=(value:string,y:number,end:number,size=12,heavy=false,maxWidth=90)=>
    add(page,heavy?bold:regular,regular,value,end-maxWidth,y,{size,maxWidth,right:end});
  const booking=snapshot.booking;

  put('Number # REVIEW-'+booking.id.slice(0,8).toUpperCase(),54.2455,267.663,10,false,192);
  put(readableDate(reviewDate),86,281.17,10,false,156);
  addIdentityField(page,bold,regular,booking.customerName,264.9975,242.355,156);
  addIdentityField(page,bold,regular,booking.petNames,428.7533,242.355,112);
  addIdentityField(page,bold,regular,boardingPeriod(booking.startDate,booking.endDate),264.9975,280.62,159);
  if(booking.petBreeds)addIdentityField(page,bold,regular,booking.petBreeds,428.7533,280.62,106);
  if(/camera cage/i.test(line.label))put(' - camera cage',117.8,396.115,12,false,158);

  const quantity=`${q.billedDays} days${pets>1?` x ${pets} dogs`:''}`;
  right(quantity,396.115,349.56,12,false,81);
  right(money(line.unitPricePkr),396.115,439.11);
  right(money(line.totalPkr),396.115,520.88);
  // Printed service labels come directly from Canva, not from synthetic SVGs.
  for(const [y,vals] of [
    [435.130,['free','free','free']],
    [474.273,['-','-','-']],
    [513.288,['-','-','-']]
  ] as const){
    right(vals[0],y,349.56);right(vals[1],y,439.11);right(vals[2],y,520.88);
  }
  right(money(q.subtotalPkr),630.232,520.88);
  right(money(q.discounts.reduce((sum,d)=>sum+d.amountPkr,0)),669.247,520.88);
  right(money(q.totalPkr),709.012,520.88,12,true);

  // No visual internal-review banner on real records. Safety is enforced by
  // staff Access, no bank data, no official invoice number and no send route.
  // Synthetic bookings remain unmistakably marked as examples.
  if(booking.synthetic)
    add(page,bold,regular,'SYNTHETIC EXAMPLE',54.2455,307.5,
      {size:8.5,maxWidth:160,warning:true});
  pdf.setTitle(booking.synthetic
    ?'Apex Kennels | Synthetic invoice preview':'Apex Kennels | Invoice preview');
  pdf.setAuthor('Apex Kennels');
  pdf.setSubject('Staff-only booking estimate, not an issued invoice');
  return pdf.save({useObjectStreams:false});
}
