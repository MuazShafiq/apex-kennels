import {Client} from '@neondatabase/serverless';
import {sendApprovedTemplate,bookingAlertTemplateValues,WhatsappError} from './whatsapp-cloud.ts';
import {validateOwnerAlertConfig,type OwnerAlertConfig} from './owner-booking-alerts.ts';
import {DeliveryError,type DeliveryState,type DeliveryWebhookEvent} from './invoice-delivery.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export type DeliveryDb=Pick<Client,'connect'|'end'|'query'>;
export type DeliveryDbFactory=(url:string)=>DeliveryDb;
const factory:DeliveryDbFactory=url=>new Client(url);
export type OwnerAlert={state:DeliveryState;attempts:number;updatedAt:string;providerMessageId:string|null;errorKind:string|null};
export type OwnerAlertRow=OwnerAlert&{bookingId:string};
function id(value:string):void{if(!UUID.test(value))throw new Error('Invalid booking reference');}
function actor(value:string):void{if(!/^[^@\s]{1,80}@[^@\s]{1,160}$/.test(value))throw new Error('Invalid staff identity');}
async function connected<T>(url:string,fn:(db:DeliveryDb)=>Promise<T>,makeDb:DeliveryDbFactory=factory):Promise<T>{
  const db=makeDb(url);await db.connect();try{return await fn(db);}finally{await db.end();}
}
async function audit(db:DeliveryDb,bookingId:string,action:string,by:string):Promise<void>{
  await db.query('INSERT INTO public.owner_alert_audit(booking_id,action,actor) VALUES($1,$2,$3)',[bookingId,action,by]);
}
export async function loadOwnerAlert(url:string,bookingId:string,makeDb:DeliveryDbFactory=factory):Promise<OwnerAlert|null>{
  id(bookingId);return connected(url,async db=>{
    const result=await db.query('SELECT state,attempts,updated_at::text,provider_message_id,error_kind FROM public.owner_alert_outbox WHERE booking_id=$1',[bookingId]);
    const row=result.rows[0];return row?{state:row.state,attempts:row.attempts,updatedAt:row.updated_at,
      providerMessageId:row.provider_message_id,errorKind:row.error_kind}:null;
  },makeDb);
}
const APPLY_EVENTS=`UPDATE public.owner_alert_outbox o SET state=CASE
 WHEN EXISTS(SELECT 1 FROM public.owner_alert_events e WHERE e.provider_message_id=o.provider_message_id AND e.recipient=o.recipient AND e.state='delivered') THEN 'delivered'
 WHEN o.state='delivered' THEN 'delivered'
 WHEN EXISTS(SELECT 1 FROM public.owner_alert_events e WHERE e.provider_message_id=o.provider_message_id AND e.recipient=o.recipient AND e.state='failed') THEN 'failed'
 ELSE o.state END, error_kind=CASE
 WHEN o.state='delivered' OR EXISTS(SELECT 1 FROM public.owner_alert_events e WHERE e.provider_message_id=o.provider_message_id AND e.recipient=o.recipient AND e.state='delivered') THEN NULL
 WHEN EXISTS(SELECT 1 FROM public.owner_alert_events e WHERE e.provider_message_id=o.provider_message_id AND e.recipient=o.recipient AND e.state='failed') THEN 'failed'
 ELSE o.error_kind END, updated_at=now() WHERE provider_message_id=$1`;
/** Claim commits before networking. Crashes never permit automatic resend. */
export async function dispatchOwnerAlert(url:string,bookingId:string,config:OwnerAlertConfig,fetcher:typeof fetch=fetch,makeDb:DeliveryDbFactory=factory):Promise<void>{
  id(bookingId);const intent=validateOwnerAlertConfig(config);
  const claimed=await connected(url,async db=>{await db.query('BEGIN');try{
    const stale=await db.query("UPDATE public.owner_alert_outbox SET state='ambiguous',error_kind='ambiguous',updated_at=now() WHERE booking_id=$1 AND state='sending' AND updated_at<now()-interval '2 minutes' RETURNING booking_id",[bookingId]);
    if(stale.rows.length)await audit(db,bookingId,'stale_sending_ambiguous','system');
    const result=await db.query("UPDATE public.owner_alert_outbox SET state='sending',attempts=attempts+1,error_kind=NULL,updated_at=now() WHERE booking_id=$1 AND state='queued' AND attempts<3 AND next_attempt_at<=now() AND recipient=$2 AND sender_id=$3 AND template=$4 AND consent=$5::jsonb RETURNING recipient,attempts",
      [bookingId,intent.recipient,intent.senderId,intent.template,JSON.stringify(intent.consent)]);
    if(!result.rows.length){await db.query('COMMIT');return null;}
    await audit(db,bookingId,'sending','system');await db.query('COMMIT');
    return {recipient:result.rows[0].recipient,attempt:result.rows[0].attempts};
  }catch(error){await db.query('ROLLBACK');throw error;}},makeDb);
  if(!claimed)return;
  let outcome:{messageId:string}|DeliveryError;
  try{outcome=await sendApprovedTemplate(config,claimed.recipient,intent.template,bookingAlertTemplateValues(bookingId.slice(0,8)),fetcher);}
  catch(error){outcome=new DeliveryError(error instanceof WhatsappError?error.kind:'ambiguous');}
  await connected(url,async db=>{await db.query('BEGIN');try{
    if(outcome instanceof DeliveryError){
      const updated=await db.query("UPDATE public.owner_alert_outbox SET state=$2,error_kind=$2,updated_at=now(),next_attempt_at=now()+interval '5 minutes' WHERE booking_id=$1 AND attempts=$3 AND state IN ('sending','ambiguous') RETURNING booking_id",[bookingId,outcome.kind,claimed.attempt]);
      if(updated.rows.length)await audit(db,bookingId,outcome.kind,'system');
      if(updated.rows.length&&outcome.kind==='failed')await db.query("UPDATE public.owner_alert_outbox SET state='queued',updated_at=now() WHERE booking_id=$1 AND state='failed' AND attempts<3 AND provider_message_id IS NULL",[bookingId]);
    }else{
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,43))',[outcome.messageId]);
      const updated=await db.query("UPDATE public.owner_alert_outbox SET state='provider_accepted',provider_message_id=$2,error_kind=NULL,updated_at=now(),next_attempt_at=now()+interval '5 minutes' WHERE booking_id=$1 AND attempts=$3 AND state IN ('sending','ambiguous') RETURNING booking_id",[bookingId,outcome.messageId,claimed.attempt]);
      if(updated.rows.length){await audit(db,bookingId,'provider_accepted','system');await db.query(APPLY_EVENTS,[outcome.messageId]);}
    }
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}},makeDb);
}
/** Only explicit preacceptance failures can retry, with three total attempts. */
export async function retryOwnerAlert(url:string,bookingId:string,by:string,makeDb:DeliveryDbFactory=factory):Promise<void>{
  id(bookingId);actor(by);await connected(url,async db=>{await db.query('BEGIN');try{
    const result=await db.query("UPDATE public.owner_alert_outbox SET state='queued',error_kind=NULL,next_attempt_at=now(),updated_at=now() WHERE booking_id=$1 AND state='failed' AND provider_message_id IS NULL AND attempts<3 RETURNING booking_id",[bookingId]);
    if(!result.rows.length)throw new Error('Retry requires a definite rejection with remaining attempts; reconcile unknown outcomes manually');
    await audit(db,bookingId,'manual_retry',by);await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}},makeDb);
}
/** Owner must reconcile against Meta evidence; this action never sends or retries. */
export async function reconcileOwnerAlert(url:string,bookingId:string,by:string,
  input:{messageId?:string;confirmedNotSent?:boolean;evidence:string;deliveryState?:string},makeDb:DeliveryDbFactory=factory):Promise<void>{
  id(bookingId);actor(by);
  if(typeof input.evidence!=='string'||!input.evidence.trim()||input.evidence.length>200||/[\x00-\x1f\x7f]/.test(input.evidence)||
    (!input.deliveryState&&(!!input.messageId===(input.confirmedNotSent===true)))||
    (input.deliveryState&&(!['delivered','failed'].includes(input.deliveryState)||!!input.messageId||input.confirmedNotSent===true))||
    (input.messageId&&!/^wamid\.[A-Za-z0-9+/=_-]{8,500}$/.test(input.messageId)))throw new Error('Explicit provider reconciliation evidence required');
  await connected(url,async db=>{await db.query('BEGIN');try{
    if(input.deliveryState){
      const result=await db.query("UPDATE public.owner_alert_outbox SET state=$2,error_kind=$3,updated_at=now() WHERE booking_id=$1 AND provider_message_id IS NOT NULL AND state IN ('provider_accepted','failed') RETURNING booking_id",
        [bookingId,input.deliveryState,input.deliveryState==='failed'?'failed':null]);
      if(!result.rows.length)throw new Error('Known provider acceptance required for terminal reconciliation');
      await db.query('INSERT INTO public.owner_alert_audit(booking_id,action,actor,evidence) VALUES($1,$2,$3,$4)',[bookingId,'reconciled_'+input.deliveryState,by,input.evidence.trim()]);
      await db.query('COMMIT');return;
    }
    if(input.messageId)await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,43))',[input.messageId]);
    const changed=await db.query("UPDATE public.owner_alert_outbox SET state=$2,provider_message_id=$3,error_kind=$4,updated_at=now() WHERE booking_id=$1 AND provider_message_id IS NULL AND (state='ambiguous' OR (state='sending' AND updated_at<now()-interval '2 minutes')) RETURNING booking_id",
      [bookingId,input.messageId?'provider_accepted':'failed',input.messageId??null,input.messageId?null:'failed']);
    if(!changed.rows.length)throw new Error('Only unresolved provider outcomes can be reconciled');
    await db.query('INSERT INTO public.owner_alert_audit(booking_id,action,actor,evidence) VALUES($1,$2,$3,$4)',
      [bookingId,input.messageId?'reconciled_provider_id':'reconciled_not_sent',by,input.evidence.trim()]);
    if(input.messageId)await db.query(APPLY_EVENTS,[input.messageId]);
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}},makeDb);
}
/** Signature must already be verified. Replays are deduplicated transactionally. */
export async function applyOwnerAlertWebhook(url:string,events:DeliveryWebhookEvent[],makeDb:DeliveryDbFactory=factory):Promise<void>{
  await connected(url,async db=>{await db.query('BEGIN');try{
    // Serialize provider-ID attachment and callbacks, including callbacks arriving
    // before acceptance persistence. Stable ordering avoids multi-event deadlocks.
    for(const event of [...events].sort((a,b)=>a.messageId.localeCompare(b.messageId))){
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,43))',[event.messageId]);
      const result=await db.query('INSERT INTO public.owner_alert_events(provider_message_id,recipient,state,provider_timestamp,error_code) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING provider_message_id',
        [event.messageId,event.recipient,event.state,event.timestamp,event.errorCode??null]);
      await db.query(APPLY_EVENTS,[event.messageId]);
      if(result.rows.length)await db.query('INSERT INTO public.owner_alert_audit(booking_id,action,actor) SELECT booking_id,$2,$3 FROM public.owner_alert_outbox WHERE provider_message_id=$1 AND recipient=$4',
        [event.messageId,'webhook_'+event.state,'meta',event.recipient]);
    }
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}},makeDb);
}

/** Bounded scheduled sweep; claims serialize concurrent requests and cron invocations. */
export async function sweepOwnerAlerts(url:string,config:OwnerAlertConfig,fetcher:typeof fetch=fetch,makeDb:DeliveryDbFactory=factory):Promise<void>{
  const intent=validateOwnerAlertConfig(config);
  const ids=await connected(url,async db=>{
    await db.query("WITH stale AS (UPDATE public.owner_alert_outbox SET state='ambiguous',error_kind='ambiguous',updated_at=now() WHERE booking_id IN (SELECT booking_id FROM public.owner_alert_outbox WHERE state='sending' AND updated_at<now()-interval '2 minutes' LIMIT 100 FOR UPDATE SKIP LOCKED) RETURNING booking_id) INSERT INTO public.owner_alert_audit(booking_id,action,actor) SELECT booking_id,'stale_sending_ambiguous','system' FROM stale");
    await db.query("UPDATE public.owner_alert_outbox SET error_kind='status_overdue' WHERE state='provider_accepted' AND updated_at<now()-interval '24 hours' AND error_kind IS NULL");
    return (await db.query("SELECT booking_id FROM public.owner_alert_outbox WHERE state='queued' AND attempts<3 AND next_attempt_at<=now() AND recipient=$1 AND sender_id=$2 AND template=$3 AND consent=$4::jsonb ORDER BY next_attempt_at LIMIT 20",[intent.recipient,intent.senderId,intent.template,JSON.stringify(intent.consent)])).rows;
  },makeDb);
  for(const row of ids)await dispatchOwnerAlert(url,row.booking_id,config,fetcher,makeDb);
}

export async function listOwnerAlerts(url:string,makeDb:DeliveryDbFactory=factory,offset=0):Promise<OwnerAlertRow[]>{
  return connected(url,async db=>(await db.query("SELECT booking_id,state,attempts,updated_at::text,provider_message_id,error_kind FROM public.owner_alert_outbox ORDER BY (state<>'delivered') DESC,created_at ASC LIMIT 100 OFFSET $1",[offset])).rows.map(row=>({bookingId:row.booking_id,state:row.state,attempts:row.attempts,updatedAt:row.updated_at,providerMessageId:row.provider_message_id,errorKind:row.error_kind})),makeDb);
}
