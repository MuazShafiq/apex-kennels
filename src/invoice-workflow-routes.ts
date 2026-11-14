import type {WorkerEnv} from './cloudflare-worker.ts';
import {InvoiceApprovalError,INVOICE_UUID,requireInvoiceOwner,type ApprovalConfig,type ApprovedInvoice} from './invoice-approval.ts';
import {approveInvoice,issueInvoice,loadApprovedInvoice,loadIssuedInvoicePdf} from './invoice-approval-store.ts';
import {enqueueInvoiceDelivery,loadInvoiceDelivery,dispatchInvoiceDelivery,retryInvoiceDelivery,reconcileInvoiceDelivery,applyInvoiceWebhook} from './invoice-delivery-store.ts';
import {verifyInvoiceWebhook,parseInvoiceWebhook,validateDeliveryConfig,DeliveryError} from './invoice-delivery.ts';
import {renderCanvaApprovedPdf,renderCanvaStaffPdf} from './canva-invoice-pdf.ts';
import {loadSavedReview,DraftSaveError} from './staff-saved-review.ts';
import {renderInvoiceApprovalPage} from './staff-invoice-approval.ts';

const response=(error:string,status:number)=>new Response(JSON.stringify({error}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export const approvalConfig=(env:WorkerEnv):ApprovalConfig=>({enabled:env.APEX_INVOICE_APPROVAL_ENABLED,issuanceEnabled:env.APEX_INVOICE_ISSUANCE_ENABLED,deliveryEnabled:env.APEX_INVOICE_WHATSAPP_ENABLED,ownerEmail:env.APEX_INVOICE_OWNER_EMAIL,bankDetailsJson:env.APEX_INVOICE_BANK_JSON,manualNumberFloor:env.APEX_INVOICE_MANUAL_NUMBER_FLOOR});
const deliveryConfig=(env:WorkerEnv)=>({enabled:env.APEX_INVOICE_WHATSAPP_ENABLED,accessToken:env.WHATSAPP_ACCESS_TOKEN??'',phoneNumberId:env.WHATSAPP_PHONE_NUMBER_ID??'',apiVersion:env.WHATSAPP_GRAPH_VERSION??'',template:env.APEX_INVOICE_WHATSAPP_TEMPLATE??'',language:env.APEX_INVOICE_WHATSAPP_LANGUAGE??'en_US'});
const services={approveInvoice,issueInvoice,loadApprovedInvoice,loadIssuedInvoicePdf,enqueueInvoiceDelivery,loadInvoiceDelivery,dispatchInvoiceDelivery,retryInvoiceDelivery,reconcileInvoiceDelivery,loadSavedReview,applyInvoiceWebhook};
export type InvoiceWorkflowDeps=Partial<typeof services>;
async function rawBody(request:Request,limit:number):Promise<Uint8Array>{
  if(!request.body)throw new InvoiceApprovalError('Empty request',400);
  const reader=request.body.getReader();const parts:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new InvoiceApprovalError('Request too large',413);}parts.push(value);}}finally{reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return result;
}
export async function invoiceWebhookRoute(request:Request,env:WorkerEnv,deps:InvoiceWorkflowDeps={}):Promise<Response>{
  if(!env.DATABASE_URL||!env.APEX_INVOICE_WEBHOOK_SECRET||!env.WHATSAPP_PHONE_NUMBER_ID)return response('Webhook is not configured',503);
  const url=new URL(request.url);
  if(request.method==='GET'){
    // Verification token is independent from the app signing secret.
    if(!env.APEX_INVOICE_WEBHOOK_VERIFY_TOKEN||url.searchParams.get('hub.mode')!=='subscribe'||url.searchParams.get('hub.verify_token')!==env.APEX_INVOICE_WEBHOOK_VERIFY_TOKEN)return response('Forbidden',403);
    const challenge=url.searchParams.get('hub.challenge')??'';
    if(!/^\d{1,100}$/.test(challenge))return response('Invalid challenge',400);
    return new Response(challenge,{headers:{'Cache-Control':'no-store','Content-Type':'text/plain'}});
  }
  if(request.method!=='POST')return response('Method not allowed',405);
  try{
    const raw=await rawBody(request,262144);
    if(!verifyInvoiceWebhook(raw,request.headers.get('x-hub-signature-256'),env.APEX_INVOICE_WEBHOOK_SECRET))return response('Forbidden',403);
    await (deps.applyInvoiceWebhook??applyInvoiceWebhook)(env.DATABASE_URL,parseInvoiceWebhook(raw,env.WHATSAPP_PHONE_NUMBER_ID));
    return new Response('OK',{headers:{'Cache-Control':'no-store'}});
  }catch(e){return response(e instanceof InvoiceApprovalError?e.message:'Webhook could not be processed',e instanceof InvoiceApprovalError?e.status:503);}
}

/** Authentication, exact owner and recent signed Access identity checked by caller. */
export async function invoiceStaffRoute(request:Request,env:WorkerEnv,email:string,deps:InvoiceWorkflowDeps={}):Promise<Response>{
  const {approveInvoice,issueInvoice,loadApprovedInvoice,loadIssuedInvoicePdf,enqueueInvoiceDelivery,loadInvoiceDelivery,dispatchInvoiceDelivery,retryInvoiceDelivery,reconcileInvoiceDelivery,loadSavedReview}={...services,...deps};
  const path=new URL(request.url).pathname,writing=request.method==='POST';
  const actions=['approve','issue','send','retry','reconcile'];
  const action=path.split('/').pop()??'';
  if(!['review','view','pdf','preview.pdf',...actions].includes(action)||path!=='/staff/invoices/'+action)return response('Not found',404);
  if(request.method!==(actions.includes(action)?'POST':'GET'))return response('Method not allowed',405);
  if(!env.DATABASE_URL)return response('Database not configured',503);
  if(writing&&(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site'))return response('Forbidden',403);
  try{
    requireInvoiceOwner(email,approvalConfig(env));
    const url=new URL(request.url);let form:URLSearchParams;
    if(writing){
      if(!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return response('Expected browser form',415);
      form=new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(await rawBody(request,4096)));
      if(url.search)return response('Invalid invoice action URL',400);
      const allowed=action==='approve'?['id','revision','invoiceNumber','transportVerified','fuelVerified','phone','consentedAt','evidence','confirmed','intent']:action==='reconcile'?['id','messageId','confirmedNotSent','evidence','confirmed']:['id','confirmed'];
      if([...form.keys()].some(k=>!allowed.includes(k)||form.getAll(k).length!==1)||form.get('confirmed')!=='true')return response('Confirm the action using the review form',400);
    }else{
      form=url.searchParams;
      if([...form.keys()].some(k=>k!=='id')||form.getAll('id').length!==1)return response('Invalid invoice request',400);
    }
    const id=form.get('id')??'';if(!INVOICE_UUID.test(id))return response('Invalid invoice reference',400);
    const config=approvalConfig(env);
    const redirect=(invoiceId:string)=>new Response(null,{status:303,headers:{Location:'/staff/invoices/view?id='+encodeURIComponent(invoiceId),'Cache-Control':'private, no-store'}});
    const finishIssue=async(invoice:ApprovedInvoice)=>{
      if(env.APEX_INVOICE_ISSUANCE_ENABLED!=='true')throw new InvoiceApprovalError('Invoice issuance is disabled',503);
      if(invoice.snapshot.deliveryRequested)validateDeliveryConfig(deliveryConfig(env));
      if(!env.ASSETS)throw new InvoiceApprovalError('Invoice template unavailable',503);
      const template=await env.ASSETS.fetch(new Request(new URL('/invoice/canva-blank.pdf',request.url)));
      if(!template.ok)throw new InvoiceApprovalError('Invoice template unavailable',503);
      const pdf=await renderCanvaApprovedPdf(invoice.snapshot,new Uint8Array(await template.arrayBuffer()));
      await issueInvoice(env.DATABASE_URL!,invoice.id,email,config,pdf);
      if(invoice.snapshot.deliveryRequested)await dispatchInvoiceDelivery(env.DATABASE_URL!,invoice.id,deliveryConfig(env));
      return redirect(invoice.id);
    };
    if(action==='approve'){
      const revision=form.get('revision')??'';
      if(!/^[1-9]\d{0,6}$/.test(revision))return response('Invalid revision',400);
      const phone=form.get('phone')??'',consentedAt=form.get('consentedAt')??'',evidence=form.get('evidence')??'';
      const intent=form.get('intent')??'approve_only';
      if(!['approve_only','issue_and_send'].includes(intent))return response('Invalid approval action',400);
      if(intent==='issue_and_send')validateDeliveryConfig(deliveryConfig(env));
      const invoice=await approveInvoice(env.DATABASE_URL,{bookingId:id,revision:Number(revision),invoiceNumber:form.get('invoiceNumber')??'',confirmed:true,deliveryRequested:intent==='issue_and_send',transportVerified:form.get('transportVerified')==='true',fuelVerified:form.get('fuelVerified')==='true',...(phone||consentedAt||evidence?{consent:{phone,consentedAt,evidence,purpose:'invoice_pdf' as const}}:{})},email,config);
      if(invoice.snapshot.deliveryRequested)return await finishIssue(invoice);
      return redirect(invoice.id);
    }
    if(action==='issue'){
      const invoice=await loadApprovedInvoice(env.DATABASE_URL,id);if(!invoice)return response('Invoice not found',404);
      return await finishIssue(invoice);
    }
    if(action==='reconcile'){
      await reconcileInvoiceDelivery(env.DATABASE_URL,id,email,{messageId:form.get('messageId')||undefined,confirmedNotSent:form.get('confirmedNotSent')==='true',evidence:form.get('evidence')??''});return redirect(id);
    }
    if(action==='send'||action==='retry'){
      if(env.APEX_INVOICE_WHATSAPP_ENABLED!=='true')return response('Customer WhatsApp sending is disabled',503);
      if(action==='retry')await retryInvoiceDelivery(env.DATABASE_URL,id,email);
      else await enqueueInvoiceDelivery(env.DATABASE_URL,id,email);
      await dispatchInvoiceDelivery(env.DATABASE_URL,id,deliveryConfig(env));return redirect(id);
    }
    let body:string;
    if(action==='review'){
      const existing=await loadApprovedInvoice(env.DATABASE_URL,id);
      if(existing)return redirect(existing.id);
      const saved=await loadSavedReview(env.DATABASE_URL,id);if(!saved)return response('Saved review not found',404);
      let paymentSummary='Secure HBL payment configuration is missing or invalid.';
      try{const p=JSON.parse(env.APEX_INVOICE_BANK_JSON??'');if(p.bank==='HBL'&&typeof p.accountTitle==='string'&&typeof p.accountNumber==='string')paymentSummary='HBL · '+p.accountTitle+' · account ending '+p.accountNumber.slice(-4);}catch{/* Do not reflect secret parser errors. */}
      body=renderInvoiceApprovalPage({saved,paymentSummary,approvalEnabled:env.APEX_INVOICE_APPROVAL_ENABLED==='true',issuanceEnabled:env.APEX_INVOICE_ISSUANCE_ENABLED==='true',sendEnabled:env.APEX_INVOICE_WHATSAPP_ENABLED==='true'});
    }else{
      const invoice=await loadApprovedInvoice(env.DATABASE_URL,id);if(!invoice)return response('Invoice not found',404);
      if(action==='pdf'||action==='preview.pdf'){
        // Read back the immutable stored artifact, never regenerate at download.
        let pdf:Uint8Array|null;
        if(action==='preview.pdf'){
          if(!env.ASSETS)return response('Invoice template unavailable',503);
          const template=await env.ASSETS.fetch(new Request(new URL('/invoice/canva-blank.pdf',request.url)));
          if(!template.ok)return response('Invoice template unavailable',503);
          pdf=await renderCanvaStaffPdf(invoice.snapshot.review,invoice.snapshot.approvedAt.slice(0,10),new Uint8Array(await template.arrayBuffer()));
        }else pdf=await loadIssuedInvoicePdf(env.DATABASE_URL,invoice.id);
        if(!pdf)return response('Invoice is not issued',409);
        return new Response(new Blob([new Uint8Array(pdf)]),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="apex-'+(action==='preview.pdf'?'review':'invoice')+'-'+invoice.snapshot.invoiceNumber+'.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
      }
      const delivery=await loadInvoiceDelivery(env.DATABASE_URL,invoice.id);
      body=renderInvoiceApprovalPage({invoice,delivery:delivery??undefined,approvalEnabled:true,issuanceEnabled:env.APEX_INVOICE_ISSUANCE_ENABLED==='true',sendEnabled:env.APEX_INVOICE_WHATSAPP_ENABLED==='true'});
    }
    return new Response(body,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
  }catch(e){if(e instanceof InvoiceApprovalError||e instanceof DraftSaveError)return response(e.message,e.status);if(e instanceof DeliveryError)return response('Customer WhatsApp delivery is disabled or not fully configured',503);return response('Invoice action could not be completed; refresh its status before retrying',500);}
}
