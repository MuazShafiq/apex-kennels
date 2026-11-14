import {Client} from '@neondatabase/serverless';
import {createHash} from 'node:crypto';
import {validateApprovalSnapshot} from './invoice-approval.ts';
import {normalizePakistanWhatsappPhone} from './whatsapp-cloud.ts';
import {DeliveryError,sendInvoiceDocument,validateDeliveryConfig,type DeliveryConfig,type DeliveryState,type DeliveryWebhookEvent} from './invoice-delivery.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export type DeliveryDb=Pick<Client,'connect'|'end'|'query'>;
export type DeliveryDbFactory=(url:string)=>DeliveryDb;
const factory:DeliveryDbFactory=url=>new Client(url);
export type InvoiceDelivery={state:DeliveryState;attempts:number;updatedAt:string;providerMessageId:string|null;errorKind:string|null};
function id(value:string):void{if(!UUID.test(value))throw new Error('Invalid invoice reference');}
function actor(value:string):void{if(!/^[^@\s]{1,80}@[^@\s]{1,160}$/.test(value))throw new Error('Invalid staff identity');}
async function connected<T>(url:string,fn:(db:DeliveryDb)=>Promise<T>,makeDb:DeliveryDbFactory=factory):Promise<T>{
  const db=makeDb(url);await db.connect();try{return await fn(db);}finally{await db.end();}
}
async function audit(db:DeliveryDb,invoiceId:string,action:string,by:string):Promise<void>{
  await db.query('INSERT INTO public.invoice_delivery_audit(invoice_id,action,actor) VALUES($1,$2,$3)',[invoiceId,action,by]);
}
/** An issued invoice owns exactly one immutable recipient/consent delivery intent. */
export async function enqueueInvoiceDelivery(url:string,invoiceId:string,by:string,makeDb:DeliveryDbFactory=factory):Promise<void>{
  id(invoiceId);actor(by);
  await connected(url,async db=>{await db.query('BEGIN');try{
    const result=await db.query('SELECT snapshot,status,pdf_sha256 FROM public.approved_invoices WHERE id=$1 FOR UPDATE',[invoiceId]);
    const invoice=result.rows[0];const snapshot=invoice?validateApprovalSnapshot(invoice.snapshot):null;const consent=snapshot?.consent;
    if(invoice?.status!=='issued'||!invoice.pdf_sha256||snapshot?.review?.booking?.synthetic!==false||
      consent?.purpose!=='invoice_pdf'||typeof consent.phone!=='string'||typeof consent.evidence!=='string'||
      !consent.evidence.trim()||typeof consent.recordedBy!=='string'||!Number.isFinite(Date.parse(consent.consentedAt))||
      Date.parse(consent.consentedAt)>Date.now())throw new Error('Issued invoice and explicit invoice delivery consent required');
    const recipient=normalizePakistanWhatsappPhone(consent.phone);
    const inserted=await db.query('INSERT INTO public.invoice_delivery_outbox(invoice_id,recipient,consent) VALUES($1,$2,$3::jsonb) ON CONFLICT(invoice_id) DO NOTHING RETURNING invoice_id',
      [invoiceId,recipient,JSON.stringify(consent)]);
    if(inserted.rows.length)await audit(db,invoiceId,'queued',by);
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}},makeDb);
}
export async function loadInvoiceDelivery(url:string,invoiceId:string,makeDb:DeliveryDbFactory=factory):Promise<InvoiceDelivery|null>{
  id(invoiceId);return connected(url,async db=>{
    const result=await db.query('SELECT state,attempts,updated_at::text,provider_message_id,error_kind FROM public.invoice_delivery_outbox WHERE invoice_id=$1',[invoiceId]);
    const row=result.rows[0];return row?{state:row.state,attempts:row.attempts,updatedAt:row.updated_at,
      providerMessageId:row.provider_message_id,errorKind:row.error_kind}:null;
  },makeDb);
}
const APPLY_EVENTS=`UPDATE public.invoice_delivery_outbox o SET state=CASE
 WHEN EXISTS(SELECT 1 FROM public.invoice_delivery_events e WHERE e.provider_message_id=o.provider_message_id AND e.recipient=o.recipient AND e.state='delivered') THEN 'delivered'
 WHEN o.state='delivered' THEN 'delivered'
 WHEN EXISTS(SELECT 1 FROM public.invoice_delivery_events e WHERE e.provider_message_id=o.provider_message_id AND e.recipient=o.recipient AND e.state='failed') THEN 'failed'
 ELSE o.state END, error_kind=CASE
 WHEN o.state='delivered' OR EXISTS(SELECT 1 FROM public.invoice_delivery_events e WHERE e.provider_message_id=o.provider_message_id AND e.recipient=o.recipient AND e.state='delivered') THEN NULL
 WHEN EXISTS(SELECT 1 FROM public.invoice_delivery_events e WHERE e.provider_message_id=o.provider_message_id AND e.recipient=o.recipient AND e.state='failed') THEN 'failed'
 ELSE o.error_kind END, updated_at=now() WHERE provider_message_id=$1`;
/** Claim commits before networking. Crashes never permit automatic resend. */
export async function dispatchInvoiceDelivery(url:string,invoiceId:string,config:DeliveryConfig,fetcher:typeof fetch=fetch,makeDb:DeliveryDbFactory=factory):Promise<void>{
  id(invoiceId);validateDeliveryConfig(config);
  const claimed=await connected(url,async db=>{await db.query('BEGIN');try{
    const stale=await db.query("UPDATE public.invoice_delivery_outbox SET state='ambiguous',error_kind='ambiguous',updated_at=now() WHERE invoice_id=$1 AND state='sending' AND updated_at<now()-interval '2 minutes' RETURNING invoice_id",[invoiceId]);
    if(stale.rows.length)await audit(db,invoiceId,'stale_sending_ambiguous','system');
    const result=await db.query("UPDATE public.invoice_delivery_outbox SET state='sending',attempts=attempts+1,error_kind=NULL,updated_at=now() WHERE invoice_id=$1 AND state='queued' AND attempts<3 RETURNING recipient,consent,attempts",[invoiceId]);
    if(!result.rows.length){await db.query('COMMIT');return null;}
    const invoice=await db.query("SELECT invoice_number,pdf_bytes,pdf_sha256,snapshot FROM public.approved_invoices WHERE id=$1 AND status='issued'",[invoiceId]);
    const row=invoice.rows[0],snapshot=row?validateApprovalSnapshot(row.snapshot):null;
    if(!row||!row.pdf_bytes||snapshot?.review.booking.synthetic!==false||
      snapshot.invoiceNumber!==row.invoice_number||!snapshot.consent||
      normalizePakistanWhatsappPhone(snapshot.consent.phone)!==result.rows[0].recipient||
      JSON.stringify(row.snapshot.consent)!==JSON.stringify(result.rows[0].consent))throw new Error('Issued delivery evidence mismatch');
    const pdf=new Uint8Array(row.pdf_bytes);
    if(!/^[a-f0-9]{64}$/.test(row.pdf_sha256??'')||createHash('sha256').update(pdf).digest('hex')!==row.pdf_sha256)
      throw new Error('Stored invoice PDF integrity check failed');
    await audit(db,invoiceId,'sending','system');await db.query('COMMIT');
    return {recipient:result.rows[0].recipient,invoiceNumber:row.invoice_number,pdf,attempt:result.rows[0].attempts};
  }catch(error){await db.query('ROLLBACK');throw error;}},makeDb);
  if(!claimed)return;
  let outcome:{messageId:string}|DeliveryError;
  try{outcome=await sendInvoiceDocument(config,claimed,fetcher);}catch(error){outcome=error instanceof DeliveryError?error:new DeliveryError('ambiguous');}
  await connected(url,async db=>{await db.query('BEGIN');try{
    if(outcome instanceof DeliveryError){
      const updated=await db.query("UPDATE public.invoice_delivery_outbox SET state=$2,error_kind=$2,updated_at=now() WHERE invoice_id=$1 AND attempts=$3 AND state IN ('sending','ambiguous') RETURNING invoice_id",[invoiceId,outcome.kind,claimed.attempt]);
      if(updated.rows.length)await audit(db,invoiceId,outcome.kind,'system');
    }else{
      const updated=await db.query("UPDATE public.invoice_delivery_outbox SET state='provider_accepted',provider_message_id=$2,error_kind=NULL,updated_at=now() WHERE invoice_id=$1 AND attempts=$3 AND state IN ('sending','ambiguous') RETURNING invoice_id",[invoiceId,outcome.messageId,claimed.attempt]);
      if(updated.rows.length){await audit(db,invoiceId,'provider_accepted','system');await db.query(APPLY_EVENTS,[outcome.messageId]);}
    }
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}},makeDb);
}
/** Only explicit preacceptance failures can retry, with three total attempts. */
export async function retryInvoiceDelivery(url:string,invoiceId:string,by:string,makeDb:DeliveryDbFactory=factory):Promise<void>{
  id(invoiceId);actor(by);await connected(url,async db=>{await db.query('BEGIN');try{
    const result=await db.query("UPDATE public.invoice_delivery_outbox SET state='queued',error_kind=NULL,updated_at=now() WHERE invoice_id=$1 AND state='failed' AND provider_message_id IS NULL AND attempts<3 RETURNING invoice_id",[invoiceId]);
    if(!result.rows.length)throw new Error('Retry requires a definite rejection with remaining attempts; reconcile unknown outcomes manually');
    await audit(db,invoiceId,'manual_retry',by);await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}},makeDb);
}
/** Owner must reconcile against Meta evidence; this action never sends or retries. */
export async function reconcileInvoiceDelivery(url:string,invoiceId:string,by:string,
  input:{messageId?:string;confirmedNotSent?:boolean;evidence:string},makeDb:DeliveryDbFactory=factory):Promise<void>{
  id(invoiceId);actor(by);
  if(typeof input.evidence!=='string'||!input.evidence.trim()||input.evidence.length>200||/[\x00-\x1f\x7f]/.test(input.evidence)||
    (!!input.messageId===(input.confirmedNotSent===true))||
    (input.messageId&&!/^wamid\.[A-Za-z0-9+/=_-]{8,500}$/.test(input.messageId)))throw new Error('Explicit provider reconciliation evidence required');
  await connected(url,async db=>{await db.query('BEGIN');try{
    const changed=await db.query("UPDATE public.invoice_delivery_outbox SET state=$2,provider_message_id=$3,error_kind=$4,updated_at=now() WHERE invoice_id=$1 AND provider_message_id IS NULL AND (state='ambiguous' OR (state='sending' AND updated_at<now()-interval '2 minutes')) RETURNING invoice_id",
      [invoiceId,input.messageId?'provider_accepted':'failed',input.messageId??null,input.messageId?null:'failed']);
    if(!changed.rows.length)throw new Error('Only unresolved provider outcomes can be reconciled');
    await db.query('INSERT INTO public.invoice_delivery_audit(invoice_id,action,actor,evidence) VALUES($1,$2,$3,$4)',
      [invoiceId,input.messageId?'reconciled_provider_id':'reconciled_not_sent',by,input.evidence.trim()]);
    if(input.messageId)await db.query(APPLY_EVENTS,[input.messageId]);
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}},makeDb);
}
/** Signature must already be verified. Replays are deduplicated transactionally. */
export async function applyInvoiceWebhook(url:string,events:DeliveryWebhookEvent[],makeDb:DeliveryDbFactory=factory):Promise<void>{
  await connected(url,async db=>{await db.query('BEGIN');try{
    for(const event of events){
      const result=await db.query('INSERT INTO public.invoice_delivery_events(provider_message_id,recipient,state,provider_timestamp,error_code) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING provider_message_id',
        [event.messageId,event.recipient,event.state,event.timestamp,event.errorCode??null]);
      if(!result.rows.length)continue;
      await db.query(APPLY_EVENTS,[event.messageId]);
      await db.query('INSERT INTO public.invoice_delivery_audit(invoice_id,action,actor) SELECT invoice_id,$2,$3 FROM public.invoice_delivery_outbox WHERE provider_message_id=$1 AND recipient=$4',
        [event.messageId,'webhook_'+event.state,'meta',event.recipient]);
    }
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}},makeDb);
}
