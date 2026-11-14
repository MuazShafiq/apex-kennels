import {APEX_STAFF_BRAND,APEX_STAFF_THEME_CSS} from './apex-brand.ts';
import type {SavedReview} from './staff-saved-review.ts';
import type {ApprovedInvoice} from './invoice-approval.ts';
import type {InvoiceDelivery} from './invoice-delivery-store.ts';

const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const hidden=(name:string,value:string)=>`<input type="hidden" name="${name}" value="${esc(value)}">`;
const check=(name:string,text:string,required=false)=>`<label class="check"><input type="checkbox" name="${name}" value="true"${required?' required':''}><span>${text}</span></label>`;
const field=(name:string,text:string,extra='')=>`<label for="${name}">${text}</label><input id="${name}" name="${name}" ${extra}>`;
const form=(action:string,id:string,body:string,button:string,extraButton='')=>`<form method="post" action="/staff/invoices/${action}">${hidden('id',id)}${body}<button type="submit"${action==='approve'?' name="intent" value="approve_only"':''}>${button}</button>${extraButton}</form>`;

export function renderInvoiceApprovalPage(data:{saved?:SavedReview;invoice?:ApprovedInvoice;delivery?:InvoiceDelivery;paymentSummary?:string;approvalEnabled:boolean;issuanceEnabled:boolean;sendEnabled:boolean}):string{
  const {saved,invoice}=data;
  const review=invoice?.snapshot.review??saved?.snapshot;
  if(!review)throw new Error('Missing invoice review');
  const revision=invoice?.snapshot.reviewRevision??saved!.revision;
  const id=review.booking.id;
  const deliveryStatus=data.delivery?.state;
  let content=`<p><strong>${esc(review.booking.customerName)}</strong> · ${esc(review.booking.petNames)}</p><p>${esc(review.booking.startDate)} to ${esc(review.booking.endDate)}</p><p>Saved revision ${revision} · PKR ${review.quote.totalPkr.toLocaleString('en-PK')}</p><p><a href="${invoice?'/staff/invoices/preview.pdf?id='+encodeURIComponent(invoice.id):'/staff/draft/saved.pdf?id='+encodeURIComponent(id)}">Review ${invoice?'frozen':'saved'} estimate PDF</a></p>`;
  content+='<dl>'+review.quote.lines.map(line=>'<dt>'+esc(line.label)+'</dt><dd>'+line.quantity+' × PKR '+line.unitPricePkr.toLocaleString('en-PK')+' = PKR '+line.totalPkr.toLocaleString('en-PK')+'</dd>').join('')+'</dl>';
  if(review.quote.discounts.length)content+='<p>Discount: PKR '+review.quote.discounts.reduce((sum,d)=>sum+d.amountPkr,0).toLocaleString('en-PK')+'</p>';
  if(review.booking.synthetic)content+='<p role="status"><strong>SYNTHETIC · NOT PAYABLE · CUSTOMER DELIVERY BLOCKED</strong></p>';
  const payment=invoice?.snapshot.payment;
  content+='<p>Payment recipient: '+esc(payment?payment.bank+' · '+payment.accountTitle+' · account ending '+payment.accountNumber.slice(-4):data.paymentSummary??'Secure HBL configuration must be checked before approval.')+'</p>';
  if(review.transport){
    const {route,fuelRate}=review.transport;
    content+='<section><h2>Transport evidence</h2><p>Service: '+esc(review.transportService??'missing; refresh estimate')+' · total driven '+route.totalDrivenKm+' km. Pickup loop '+route.loopDistanceKm+' km'+(route.dropoffLoopDistanceKm!==undefined?' · drop-off loop '+route.dropoffLoopDistanceKm+' km':'')+'.</p><p>Customer gate: '+route.customerPin.lat+', '+route.customerPin.lon+(route.dropoffPin?' · drop-off gate: '+route.dropoffPin.lat+', '+route.dropoffPin.lon:'')+'</p><p>Gate evidence: '+esc(review.transportLocationSource==='staff_confirmed'?'Staff-confirmed customer gate for a legacy Form booking.':review.transportLocationSource==='customer_record'?'Customer-confirmed booking location.':'Missing; refresh estimate.')+'</p><p>Fuel: PKR '+fuelRate.pricePkrPerLitre+' per litre · effective '+esc(fuelRate.effectiveDate)+' · checked '+esc(fuelRate.retrievedAt)+'. '+esc(fuelRate.geographicBasis)+'</p><p>Source: '+esc(fuelRate.sourceUrl)+'. Formula: driven km ÷ 12 × petrol rate × 1.20.</p></section>';
  }
  if(!invoice){
    content+='<h2>Confirm the reviewed snapshot</h2><p>Approval freezes the prices, payment recipient and invoice number. Check the latest manually issued Canva number first. A recently authenticated owner session is required.</p>';
    if(!data.approvalEnabled)content+='<p role="status">Invoice approval is disabled.</p>';
    else content+=form('approve',id,hidden('revision',String(revision))+
      field('invoiceNumber','Four-digit invoice number','required pattern="[0-9]{4}" inputmode="numeric" maxlength="4"')+
      (review.transport?check('transportVerified','I checked the actual kennel entrance, Bawli approach and customer gate(s), including both driving loops.',true)+check('fuelVerified','I verified this saved fuel price with its date and source, and checked exceptions.',true):'')+
      '<fieldset><legend>Customer WhatsApp consent (optional for internal approval)</legend><p>Record only explicit consent to receive this invoice PDF. A phone number alone is insufficient. Leave all three fields blank to approve without delivery.</p>'+
      field('phone','Consenting WhatsApp number','type="tel" autocomplete="off" maxlength="24"')+
      field('consentedAt','Consent time (UTC ISO timestamp)','placeholder="2026-11-15T09:00:00Z" maxlength="30"')+
      field('evidence','Consent evidence reference','maxlength="200" autocomplete="off"')+'</fieldset>'+
      check('confirmed','I reviewed this exact saved revision, number and payment recipient configuration. If I choose issue and send, I authorize sending the immutable PDF to the explicitly consenting recipient.',true),'Approve snapshot',
      data.issuanceEnabled&&data.sendEnabled&&!review.booking.synthetic?'<button type="submit" name="intent" value="issue_and_send">Approve, issue &amp; send</button><p>Issue and send requires all consent fields. Approval and issuance are saved before contacting Meta; interrupted work can be resumed.</p>':'');
  }else{
    content+=`<h2>Invoice ${esc(invoice.snapshot.invoiceNumber)}</h2><p role="status">Invoice status: ${esc(invoice.status)}. Delivery: ${esc(deliveryStatus??'not queued')}.</p>`;
    if(data.delivery)content+='<p>Delivery attempts: '+data.delivery.attempts+' of 3 · updated '+esc(data.delivery.updatedAt)+(data.delivery.errorKind?' · '+esc(data.delivery.errorKind):'')+'</p>';
    if(invoice.status==='approved')content+=review.booking.synthetic?'<p>Synthetic approvals cannot be issued.</p>':invoice.snapshot.deliveryRequested&&!data.sendEnabled?'<p>Customer WhatsApp delivery is disabled. The approved delivery intent is saved; it can continue after sending is authorized.</p>':data.issuanceEnabled?form('issue',invoice.id,check('confirmed',invoice.snapshot.deliveryRequested?'Continue the approved issuance and WhatsApp delivery using the frozen snapshot and recorded consent.':'Issue the PDF from this approved snapshot and securely configured payment details.',true),invoice.snapshot.deliveryRequested?'Continue approved delivery':'Issue invoice PDF'):'<p>Invoice issuance is disabled.</p>';
    else content+=`<p><a href="/staff/invoices/pdf?id=${encodeURIComponent(invoice.id)}">Download issued PDF</a></p>`;
    if(invoice.status==='issued'){
      if(!invoice.snapshot.consent)content+='<p>No invoice PDF WhatsApp consent is recorded. Customer delivery is blocked.</p>';
      else{
        content+='<p>Invoice PDF consent recorded '+esc(invoice.snapshot.consent.consentedAt)+' · WhatsApp number ending '+esc(invoice.snapshot.consent.phone.slice(-4))+'.</p>';
        if(!data.sendEnabled)content+='<p>Customer WhatsApp delivery is disabled.</p>';
        else if(!deliveryStatus||deliveryStatus==='queued')content+=form('send',invoice.id,check('confirmed','Send this issued invoice PDF to the explicitly consenting recipient.',true),deliveryStatus==='queued'?'Resume queued delivery':'Send approved invoice');
        else if(deliveryStatus==='failed'&&!data.delivery?.providerMessageId&&(data.delivery?.attempts??3)<3)content+=form('retry',invoice.id,check('confirmed','I checked the reported failure and confirm a safe retry.',true),'Retry failed delivery');
        else if(deliveryStatus==='failed')content+='<p>Automatic retry is blocked. Check Meta failure evidence and resolve with the owner.</p>';
        if(deliveryStatus==='ambiguous'||deliveryStatus==='sending')content+='<p>The send outcome needs reconciliation against Meta records. Wait at least two minutes after a send begins. Do not resend through another channel until the outcome is known.</p>'+form('reconcile',invoice.id,field('messageId','Confirmed Meta message ID (leave blank only if definitely not sent)','maxlength="506" autocomplete="off"')+check('confirmedNotSent','Meta evidence confirms that no customer message was sent.')+field('evidence','Reconciliation evidence reference','required maxlength="200" autocomplete="off"')+check('confirmed','I checked Meta records and confirm exactly one reconciliation outcome. This action does not resend.',true),'Save reconciliation');
      }
    }
  }
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Apex | Invoice approval</title><style>'+APEX_STAFF_THEME_CSS+'*{box-sizing:border-box}body{margin:0;font-size:16px;line-height:1.6}main{max-width:760px;margin:32px auto;padding:0 18px}.panel{padding:24px;border:1px solid;border-radius:14px}label{display:block;margin-top:16px}input:not([type=checkbox]){display:block;width:100%;min-height:44px;font:inherit;padding:8px;border:1px solid;border-radius:6px}fieldset{margin:24px 0;padding:16px;border:1px solid #c6d9ef}.check{display:flex;align-items:flex-start;gap:12px}.check input{flex:0 0 22px;width:22px;height:22px;margin-top:3px}button{min-height:44px;padding:10px 18px;font:inherit;border:0;margin:20px 0;cursor:pointer}h1{font-size:32px}a{overflow-wrap:anywhere}@media(max-width:480px){.panel{padding:16px}main{margin:18px auto}h1{font-size:27px}}</style></head><body><main>'+APEX_STAFF_BRAND+'<a href="/staff">Booking queue</a><h1>Owner invoice approval</h1><section class="panel">'+content+'</section></main></body></html>';
}
