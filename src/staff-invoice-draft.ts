import {Client} from '@neondatabase/serverless';
import {buildApexInvoiceDraft,type ApexDraftQuote} from './apex-invoice-draft.ts';
import {countBilledDays} from './pricing.ts';
import {renderInvoiceHtml} from './invoice.ts';

export type StaffInvoiceSource={
  bookingId:string;
  customerName:string;
  petNames:string;
  petBreeds?:string;
  petCount:number;
  startDate:string;
  endDate:string;
  status:string;
  cameraCageRequested:boolean|null;
  transportRequested:boolean|null;
  synthetic:boolean;
};
export type StaffPackageChoice='daily'|'monthly';
export type StaffPackageSelection=StaffPackageChoice|'auto';
export type StaffDraftReview={
  booking:StaffInvoiceSource;
  packageChoice:StaffPackageChoice;
  draft:ApexDraftQuote|null;
  issues:string[];
  previewOnly:true;
  canSend:false;
  canApprove:false;
};

export function parseStaffDraftRequest(url:URL):{bookingId:string;packageChoice:StaffPackageSelection}{
  const bookingId=url.searchParams.get('id')??'';
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(bookingId)){
    throw new Error('Invalid booking id');
  }
  const choice=url.searchParams.get('package')??'auto';
  if(choice!=='auto'&&choice!=='daily'&&choice!=='monthly')throw new Error('Invalid package choice');
  return {bookingId,packageChoice:choice};
}
type Row={
  id:string;customer_name:string;pet_names:string;pet_breeds:string|null;pet_count:number|string;
  start_date:string;end_date:string;status:string;
  camera_cage_requested:boolean|null;pickup_dropoff_requested:boolean|null;
  is_synthetic:boolean;
};

/** Read-only, parameterized fetch of invoice-relevant data. NEVER load private care/health notes. */
export async function readStaffInvoiceSource(databaseUrl:string,bookingId:string):Promise<StaffInvoiceSource|null>{
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(bookingId)){
    throw new Error('Invalid booking id');
  }
  const db=new Client(databaseUrl);
  await db.connect();
  try{
    const result=await db.query<Row>(
      "SELECT b.id::text AS id,b.status,c.full_name AS customer_name,"
      +"b.start_date::text AS start_date,b.end_date::text AS end_date,"
      +"d.camera_cage_requested,d.pickup_dropoff_requested,"
      +"COALESCE(STRING_AGG(p.name, ', ' ORDER BY p.name),'') AS pet_names,"
      +"COALESCE(STRING_AGG(DISTINCT p.breed, ', ' ORDER BY p.breed),'') AS pet_breeds,"
      +"COUNT(bp.pet_id)::integer AS pet_count,"
      +"COALESCE(b.external_submission_id LIKE 'apex-cf-smoke-%',false) AS is_synthetic "
      +"FROM public.booking_requests b "
      +"JOIN public.customers c ON c.id=b.customer_id "
      +"LEFT JOIN public.booking_form_details d ON d.booking_id=b.id "
      +"LEFT JOIN public.booking_pets bp ON bp.booking_id=b.id "
      +"LEFT JOIN public.pets p ON p.id=bp.pet_id "
      +"WHERE b.id=$1 GROUP BY b.id,c.id,d.booking_id",
      [bookingId]
    );
    const row=result.rows[0];
    if(!row)return null;
    return {
      bookingId:row.id,
      customerName:row.customer_name,
      petNames:row.pet_names,
      petBreeds:row.pet_breeds||undefined,
      petCount:Number(row.pet_count),
      startDate:row.start_date,
      endDate:row.end_date,
      status:row.status,
      cameraCageRequested:row.camera_cage_requested,
      transportRequested:row.pickup_dropoff_requested,
      synthetic:row.is_synthetic || row.customer_name.startsWith('APEX CANARY ') || row.pet_names.includes('APEX SYNTHETIC CANARY PET'),
    };
  }finally{
    await db.end();
  }
}

/**
 * Never converts a booking into a customer-facing invoice.
 * This is a pricing *estimate*, not confirmed accommodation availability,
 * and missing transport is an intentionally unpriced line.
 */
export function prepareStaffDraftReview(
  source:StaffInvoiceSource,
  selection:StaffPackageSelection
):StaffDraftReview{
  const packageChoice:StaffPackageChoice=selection==='auto'
    ?countBilledDays(source.startDate,source.endDate,'inclusive_days')===30?'monthly':'daily'
    :selection;
  const issues:string[]=[];
  if(source.status!=='approved')issues.push('Booking is not approved for boarding.');
  if(source.cameraCageRequested===null){
    issues.push('Cage preference missing; do not assume normal cage.');
    return {booking:source,packageChoice,draft:null,issues,previewOnly:true,canSend:false,canApprove:false};
  }
  if(source.transportRequested===null){
    issues.push('Transport preference missing; no complete estimate is possible.');
    return {booking:source,packageChoice,draft:null,issues,previewOnly:true,canSend:false,canApprove:false};
  }
  if(!Number.isSafeInteger(source.petCount)||source.petCount<1||source.petCount>100){
    issues.push('No reliable pet quantity; verify booking before pricing.');
    return {booking:source,packageChoice,draft:null,issues,previewOnly:true,canSend:false,canApprove:false};
  }
  const monthly=packageChoice==='monthly';
  const billedDays=countBilledDays(source.startDate,source.endDate,'inclusive_days');
  if(monthly&&billedDays!==30){
    issues.push('The Rs. 10,000 monthly discount applies to a 30 billed-day stay.');
    return {booking:source,packageChoice,draft:null,issues,previewOnly:true,canSend:false,canApprove:false};
  }
  if(monthly)issues.push('30-day discount: confirm dates before approving the invoice.');
  if(source.cameraCageRequested)issues.push('Camera cage REQUESTED: check availability.');
  if(source.transportRequested)issues.push(
    'Transport amount excluded. Check pickup location and driving route before quoting.'
  );
  const draft=buildApexInvoiceDraft({
    startDate:source.startDate,endDate:source.endDate,
    cage:source.cameraCageRequested?'camera':'normal',
    petCount:source.petCount,fullMonthPackageSelected:monthly,
    transport:{requested:source.transportRequested},
  });
  return {booking:source,packageChoice,draft,issues,previewOnly:true,canSend:false,canApprove:false};
}

/**
 * Staff-only printable review copy. This has no official invoice number,
 * bank details, approval or sending action. Deliberately refuse incomplete
 * transport pricing or incomplete boarding rates.
 */
export function renderPrintableStaffReview(review:StaffDraftReview,reviewDate:string):string{
  if(!review.draft||review.booking.transportRequested)
    throw new Error('A complete boarding-only estimate is required');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate))
    throw new Error('Invalid review date');
  return renderInvoiceHtml({
    number:'REVIEW-'+review.booking.bookingId.slice(0,8).toUpperCase(),
    issuedOn:reviewDate,
    billedTo:review.booking.customerName,
    petName:review.booking.petNames,
    petBreed:review.booking.petBreeds,
    status:'DRAFT',
    reviewOnly:true,
    demo:review.booking.synthetic
  },review.draft.quote);
}

function esc(v:string):string{
  return v.replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]??c));
}
const pkr=(n:number)=>'PKR '+n.toLocaleString('en-PK');
export function renderStaffDraftReview(review:StaffDraftReview,site:'staff'|'demo'='staff',options:{enableSaving?:boolean;savedRevision?:number}={}):string{
  const source=review.booking;
  const formAction=site==='staff'?'/staff/draft':'/demo/draft';
  const select='<form method="get" action="'+formAction+'">'
    +'<input type="hidden" name="id" value="'+esc(source.bookingId)+'">'
    +'<label for="package">Boarding rate</label>'
    +'<select id="package" name="package">'
    +'<option value="daily"'+(review.packageChoice==='daily'?' selected':'')+'>Daily boarding</option>'
    +'<option value="monthly"'+(review.packageChoice==='monthly'?' selected':'')+'>30-day package (Rs. 10,000 off per dog)</option>'
    +'</select><button type="submit">Update estimate</button></form>';
  const rows=review.draft?.quote.lines.map(x=>'<tr><td>'+esc(x.label)+'</td>'
    +'<td class="number">'+x.quantity+'</td><td class="number">'+pkr(x.unitPricePkr)
    +'</td><td class="number">'+pkr(x.totalPkr)+'</td></tr>').join('')??'';
  const issueHtml=review.issues.map(x=>'<li>'+esc(x)+'</li>').join('');
  const discounts=review.draft?.quote.discounts.map(d=>'<div class="discount"><span>'+esc(d.label)+'</span><strong>− '+pkr(d.amountPkr)+'</strong></div>').join('')??'';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    +'<meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<meta name="robots" content="noindex,nofollow"><title>Apex | Invoice review</title>'
    +'<style>:root{font-family:Inter,system-ui,sans-serif;background:#f6f7f4;color:#17352a}'
    +'*{box-sizing:border-box}body{margin:0}.wrap{max-width:950px;margin:36px auto;padding:0 20px}'
    +'h1{font-size:clamp(28px,4vw,44px);letter-spacing:-.045em;margin:12px 0}p{line-height:1.6}'
    +'.tag{font-size:11px;font-weight:800;letter-spacing:.15em;color:#7a8e80;text-transform:uppercase}'
    +'.panel{background:white;border:1px solid #dce5dd;border-radius:16px;padding:26px;margin:18px 0}'
    +'.banner{background:#fff3d7;color:#7a5421;border:1px solid #ecc78e;padding:16px 20px;border-radius:12px;font-weight:700}'
    +'form{display:flex;align-items:end;gap:12px;flex-wrap:wrap}label{display:block;font-size:12px;color:#658074;margin-bottom:6px}'
    +'select,button{padding:11px;border-radius:7px;border:1px solid #cedbd0;font:inherit;font-size:13px}'
    +'button{background:#214b36;color:white;border:0;cursor:pointer}a{color:#235b43}'
    +'table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #e5eee7;padding:14px 8px;text-align:left}'
    +'th{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#7c9183}'
    +'.number{text-align:right;white-space:nowrap}.sum{display:flex;justify-content:space-between;margin-top:26px;font-size:18px;font-weight:750}'
    +'ul{line-height:1.8;color:#6a5231;font-size:13px}.muted{color:#708579;font-size:12px}'
    +'.discount{display:flex;justify-content:space-between;gap:12px;margin-top:16px;color:#386d45;font-weight:700;font-size:13px}'
    +'@media(max-width:620px){.panel{padding:15px}table{font-size:11px}}</style></head><body>'
    +'<main class="wrap"><a href="'+(site==='staff'?'/staff':'/demo/staff')+'">← Booking queue</a>'
    +'<div class="tag" style="margin-top:30px">Apex Kennels / Owner review</div>'
    +'<h1>Boarding price estimate</h1>'
    +'<div class="banner">STAFF ESTIMATE · NOT PAYABLE'
    +(source.synthetic||site==='demo'?' · SYNTHETIC DATA':'')+'</div>'
    +'<div class="panel"><p><strong>'+esc(source.customerName)+'</strong> · '+esc(source.petNames)
    +'</p><p class="muted">'+esc(source.startDate)+' to '+esc(source.endDate)
    +' · Booking '+esc(source.bookingId.slice(0,8))
    +' · '+esc(source.status.toUpperCase())+'</p>'+select+'</div>'
    +(review.draft
      ? '<div class="panel"><table><thead><tr><th>Service</th><th class="number">Qty</th>'
        +'<th class="number">Rate</th><th class="number">Subtotal</th></tr></thead><tbody>'
        +rows+'</tbody></table>'+discounts+'<div class="sum"><span>'
        +(source.transportRequested?'Boarding-only estimate · transport excluded':'Provisional subtotal')
        +'</span><span>'+pkr(review.draft.quote.totalPkr)+'</span></div>'
        +(site==='staff'&&!source.transportRequested
          ?'<p><a href="/staff/draft?id='+encodeURIComponent(source.bookingId)
            +'&amp;package='+encodeURIComponent(review.packageChoice)
            +'&amp;format=print">Preview Canva invoice (PDF)</a></p>':'')
        +(site==='staff'&&options.enableSaving&&!source.transportRequested
          &&['requested','reviewing','approved'].includes(source.status)
          ?'<form method="post" action="/staff/draft/save">'
            +'<input type="hidden" name="id" value="'+esc(source.bookingId)+'">'
            +'<input type="hidden" name="package" value="'+esc(review.packageChoice)+'">'
            +'<input type="hidden" name="revision" value="'+String(options.savedRevision??0)+'">'
            +'<button type="submit">'+(source.synthetic?(options.savedRevision?'Update synthetic test draft':'Save synthetic test draft')
              :(options.savedRevision?'Update saved draft':'Save internal draft'))+'</button></form>'
            +(options.savedRevision?'<p><a href="/staff/draft/saved?id='
              +encodeURIComponent(source.bookingId)+'">View saved Canva invoice</a> · <a href="/staff/draft/saved.pdf?id='+encodeURIComponent(source.bookingId)+'&amp;download=1">Download Canva PDF</a></p>':'')
          :'')
        +'</div>'
      : '<div class="panel"><strong>Estimate unavailable.</strong><p>Resolve the issues below.</p></div>')
    +'<div class="panel"><div class="tag">Needs attention</div><ul>'
    +issueHtml+'</ul><p class="muted">Invoice creation and payment are not available here.</p></div>'
    +'</main></body></html>';
}
