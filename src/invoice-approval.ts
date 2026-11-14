import {buildApexInvoiceDraft} from './apex-invoice-draft.ts';
import {validateSnapshot,type SavedReview,type ReviewSnapshot} from './staff-saved-review.ts';
import {normalizePakistanWhatsappPhone} from './whatsapp-cloud.ts';
import {APEX_KENNEL_LOCATION,APEX_KENNEL_ACCESS} from './apex-location-config.ts';
import {isTransportServiceLocation} from './transport-service-area.ts';
import {FUEL_SOURCE,parseNotifiedPetrolRate} from './islamabad-petrol-rate.ts';

export class InvoiceApprovalError extends Error {
  readonly status:number;
  constructor(message:string,status=409){super(message);this.status=status;}
}
export type ApprovalConfig={enabled?:string;issuanceEnabled?:string;deliveryEnabled?:string;ownerEmail?:string;bankDetailsJson?:string;manualNumberFloor?:string};
export type InvoiceConsent={phone:string;purpose:'invoice_pdf';consentedAt:string;evidence:string;recordedBy:string};
export type ApprovalInput={bookingId:string;revision:number;invoiceNumber:string;confirmed:true;transportVerified:boolean;fuelVerified:boolean;deliveryRequested?:boolean;consent?:Omit<InvoiceConsent,'recordedBy'>};
export type ApprovalSnapshot={version:1;review:ReviewSnapshot;reviewRevision:number;invoiceNumber:string;approvedBy:string;approvedAt:string;payment:{bank:'HBL';accountTitle:string;accountNumber:string;iban:string};transportVerified:boolean;fuelVerified:boolean;deliveryRequested:boolean;consent?:InvoiceConsent};
export type ApprovedInvoice={id:string;snapshot:ApprovalSnapshot;status:'approved'|'issued';issuedAt?:string;pdfSha256?:string};
export const INVOICE_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function fail(message:string,status=422):never{throw new InvoiceApprovalError(message,status);}
const text=(s:unknown,max=150):s is string=>typeof s==='string'&&s.trim().length>0&&s.length<=max&&!/[\x00-\x1f\x7f]/.test(s);
function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>JSON.stringify(key)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value)??'undefined';
}
export function requireInvoiceOwner(actor:string,config:ApprovalConfig,issuance=false):void {
  if(config.enabled!=='true'||issuance&&config.issuanceEnabled!=='true')fail('Invoice workflow is disabled',503);
  if(!config.ownerEmail||!/^\S+@\S+\.\S+$/.test(config.ownerEmail)||actor!==config.ownerEmail.trim().toLowerCase())fail('Only the configured invoice owner may perform this action',403);
}
function bank(config:ApprovalConfig):ApprovalSnapshot['payment'] {
  let p:ApprovalSnapshot['payment']|undefined;
  try{p=JSON.parse(config.bankDetailsJson??'');}catch{fail('Secure HBL payment configuration is required',503);}
  if(!p||p.bank!=='HBL'||!text(p.accountTitle,100)||!/^\d{10,24}$/.test(p.accountNumber)||!/^PK\d{2}HABB[A-Z0-9]{16}$/.test(p.iban))fail('Secure HBL payment configuration is invalid',503);
  return {bank:'HBL',accountTitle:p.accountTitle,accountNumber:p.accountNumber,iban:p.iban};
}

/** Reconstruct confirmed pricing for validation only; never replace the saved monetary snapshot. */
export function validateApprovalPricing(input:unknown):ReviewSnapshot {
  const review=validateSnapshot(input);
  const q=review.quote,boarding=q.lines[0];
  if(!boarding||!['Standard boarding','Camera cage boarding'].includes(boarding.label)||!Number.isSafeInteger(q.billedDays)||q.billedDays<1)fail('Unsupported boarding snapshot');
  const pets=boarding.quantity/q.billedDays;
  if(!Number.isSafeInteger(pets)||pets<1||pets>100||q.startDate!==review.booking.startDate||q.endDate!==review.booking.endDate||review.rateVersion!=='fatima-confirmed-2026-11-06')fail('Draft pricing needs fresh review');
  const expected=buildApexInvoiceDraft({startDate:q.startDate,endDate:q.endDate,cage:boarding.label==='Camera cage boarding'?'camera':'normal',petCount:pets,fullMonthPackageSelected:review.packageChoice==='monthly',groomingRequested:q.lines.some(l=>l.label==='Grooming (complimentary)'),transport:review.transport?{requested:true,totalDrivenKm:review.transport.route.totalDrivenKm,fuelRate:review.transport.fuelRate}:undefined}).quote;
  if(canonical(q)!==canonical(expected))fail('Saved pricing is incomplete or differs from confirmed rules');
  if(review.transport){
    const r=review.transport.route;
    if(!review.transportService||!['pickup','dropoff','both'].includes(review.transportService)||
       !review.transportLocationSource||!['customer_record','staff_confirmed'].includes(review.transportLocationSource)||
       r.provider!=='Geoapify Routing'||r.routeType!=='kennel_access_customer_access_kennel'||
       r.needsStaffConfirmation!==true||(review.transportService==='both'?2:1)!==r.plannedRoundTrips||
       r.kennelPin?.lat!==APEX_KENNEL_LOCATION.pin.lat||r.kennelPin?.lon!==APEX_KENNEL_LOCATION.pin.lon||
       r.kennelAccessWaypoint?.lat!==APEX_KENNEL_ACCESS.pin.lat||r.kennelAccessWaypoint?.lon!==APEX_KENNEL_ACCESS.pin.lon||
       !isTransportServiceLocation(r.customerPin?.lat,r.customerPin?.lon)||
       (r.dropoffPin&&(r.plannedRoundTrips!==2||!isTransportServiceLocation(r.dropoffPin.lat,r.dropoffPin.lon)))||
       !Number.isFinite(r.loopDistanceKm)||r.loopDistanceKm<=0||r.loopDistanceKm>1000||
       (r.dropoffPin&&(r.dropoffLoopDistanceKm===undefined||!Number.isFinite(r.dropoffLoopDistanceKm)||r.dropoffLoopDistanceKm<=0)))fail('Transport route and service require a fresh verified review');
    const km=r.plannedRoundTrips===2?r.loopDistanceKm+(r.dropoffPin?r.dropoffLoopDistanceKm??NaN:r.loopDistanceKm):r.loopDistanceKm;
    if(!Number.isFinite(km)||Math.abs(km-r.totalDrivenKm)>0.001)fail('Transport loops require independent verification');
  }
  // Explicit projection: arbitrary persisted fields must never reach a customer PDF.
  return {version:1,booking:{id:review.booking.id,customerName:review.booking.customerName,petNames:review.booking.petNames,...(review.booking.petBreeds?{petBreeds:review.booking.petBreeds}:{}),startDate:review.booking.startDate,endDate:review.booking.endDate,synthetic:review.booking.synthetic},packageChoice:review.packageChoice,rateVersion:review.rateVersion,quote:structuredClone(q),...(review.transport?{transport:structuredClone(review.transport),transportService:review.transportService,transportLocationSource:review.transportLocationSource}:{})};
}
export function prepareApproval(saved:SavedReview,input:ApprovalInput,actor:string,config:ApprovalConfig,now=new Date()):ApprovalSnapshot {
  requireInvoiceOwner(actor,config);
  if(input.confirmed!==true||!INVOICE_UUID.test(input.bookingId)||!Number.isSafeInteger(input.revision)||input.revision!==saved.revision||input.revision<1||saved.snapshot.booking.id!==input.bookingId)fail('Draft revision changed; refresh and review',409);
  const age=now.getTime()-Date.parse(saved.updatedAt);
  if(!Number.isFinite(age)||age<0||age>24*60*60*1000)fail('Saved review expired; save a fresh reviewed estimate',409);
  if(!/^\d{4}$/.test(input.invoiceNumber)||!/^\d{4}$/.test(config.manualNumberFloor??'')||Number(input.invoiceNumber)<=Number(config.manualNumberFloor))fail('Invoice number must follow the verified manual Canva sequence');
  const review=validateApprovalPricing(saved.snapshot);
  if(review.transport&&(!input.transportVerified||!input.fuelVerified))fail('Verify actual kennel/Bawli/customer driving access and local fuel rate');
  if(review.transport){
    const fuel=review.transport.fuelRate;
    if(fuel.publisher!=='OilPrices.pk'||fuel.notificationAuthority!=='OGRA'||![FUEL_SOURCE.primary,FUEL_SOURCE.mirror].some(url=>url===fuel.sourceUrl))fail('Fuel source provenance requires fresh review');
    try{parseNotifiedPetrolRate({products:[{product:fuel.product,unit:fuel.unit,pricePkr:fuel.pricePkrPerLitre,effectiveDate:fuel.effectiveDate}]},{now,sourceUrl:fuel.sourceUrl});}
    catch{fail('Fuel notification must be current and verified');}
    for(const timestamp of [review.transport.route.retrievedAt,review.transport.fuelRate.retrievedAt]){
      const elapsed=now.getTime()-Date.parse(timestamp);
      if(!Number.isFinite(elapsed)||elapsed<0||elapsed>24*60*60*1000)fail('Transport and fuel evidence must be refreshed');
    }
  }
  let consent:InvoiceConsent|undefined;
  if(input.consent){
    const c=input.consent,at=Date.parse(c.consentedAt);
    if(c.purpose!=='invoice_pdf'||!Number.isFinite(at)||at>now.getTime()||!text(c.evidence,200))fail('Explicit invoice PDF WhatsApp consent evidence is required');
    consent={phone:normalizePakistanWhatsappPhone(c.phone),purpose:'invoice_pdf',consentedAt:new Date(at).toISOString(),evidence:c.evidence,recordedBy:actor};
  }
  const deliveryRequested=input.deliveryRequested===true;
  if(deliveryRequested){
    if(config.issuanceEnabled!=='true'||config.deliveryEnabled!=='true')fail('Invoice issuance and WhatsApp delivery must both be enabled',503);
    if(review.booking.synthetic||!consent)fail('Customer delivery requires a real booking and explicit invoice PDF consent');
  }
  return {version:1,review,reviewRevision:saved.revision,invoiceNumber:input.invoiceNumber,approvedBy:actor,approvedAt:now.toISOString(),payment:bank(config),transportVerified:input.transportVerified===true,fuelVerified:input.fuelVerified===true,deliveryRequested,...(consent?{consent}:{})};
}
export function validateApprovalSnapshot(raw:unknown):ApprovalSnapshot {
  if(!raw||typeof raw!=='object')fail('Invalid approved invoice');
  const s=raw as ApprovalSnapshot;
  if(s.version!==1||!Number.isSafeInteger(s.reviewRevision)||s.reviewRevision<1||!/^\d{4}$/.test(s.invoiceNumber)||!text(s.approvedBy)||!Number.isFinite(Date.parse(s.approvedAt)))fail('Invalid approved invoice');
  const review=validateApprovalPricing(s.review);
  const payment=bank({bankDetailsJson:JSON.stringify(s.payment)});
  if(review.transport&&(!s.transportVerified||!s.fuelVerified))fail('Unverified approved transport');
  let consent:InvoiceConsent|undefined;
  if(s.consent){
    const c=s.consent;
    if(c.purpose!=='invoice_pdf'||!Number.isFinite(Date.parse(c.consentedAt))||Date.parse(c.consentedAt)>Date.parse(s.approvedAt)||!text(c.evidence,200)||c.recordedBy!==s.approvedBy)fail('Invalid invoice consent');
    consent={phone:normalizePakistanWhatsappPhone(c.phone),purpose:c.purpose,consentedAt:c.consentedAt,evidence:c.evidence,recordedBy:c.recordedBy};
  }
  if(s.deliveryRequested!==undefined&&typeof s.deliveryRequested!=='boolean')fail('Invalid delivery intent');
  const deliveryRequested=s.deliveryRequested===true;
  if(deliveryRequested&&(review.booking.synthetic||!consent))fail('Customer delivery requires a real booking and explicit invoice PDF consent');
  return {version:1,review,reviewRevision:s.reviewRevision,invoiceNumber:s.invoiceNumber,approvedBy:s.approvedBy,approvedAt:s.approvedAt,payment,transportVerified:s.transportVerified===true,fuelVerified:s.fuelVerified===true,deliveryRequested,...(consent?{consent}:{})};
}
