import {createHmac,timingSafeEqual} from 'node:crypto';
import {normalizePakistanWhatsappPhone,type WhatsappConfig} from './whatsapp-cloud.ts';

export type DeliveryConfig=WhatsappConfig&{enabled?:string;template:string;language:string};
export type DeliveryState='queued'|'sending'|'provider_accepted'|'delivered'|'failed'|'ambiguous';
export class DeliveryError extends Error {
  readonly kind:'failed'|'ambiguous';
  constructor(kind:'failed'|'ambiguous'){super(kind==='ambiguous'?'Provider outcome is unknown; reconcile before retry':'Invoice delivery was not accepted');this.kind=kind;}
}
export function validateDeliveryConfig(config:DeliveryConfig):void {
  if(config.enabled!=='true')throw new DeliveryError('failed');
  if(!/^v\d{2}\.0$/.test(config.apiVersion)||!/^\d{8,30}$/.test(config.phoneNumberId)||
    config.accessToken.length<30||! /^[a-z][a-z0-9_]{2,127}$/.test(config.template)||
    !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(config.language))throw new DeliveryError('failed');
}
async function boundedJson(response:Response):Promise<Record<string,unknown>>{
  if(!response.body)throw new Error('Missing response');
  const reader=response.body.getReader();let size=0;const parts:Uint8Array[]=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>16000)throw new Error('Oversized response');parts.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
  const data:unknown=JSON.parse(new TextDecoder().decode(bytes));
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Invalid response');
  return data as Record<string,unknown>;
}
/** Uploads only the immutable issued PDF; no publicly reachable document URL. */
export async function sendInvoiceDocument(config:DeliveryConfig,input:{recipient:string;invoiceNumber:string;pdf:Uint8Array},
  fetcher:typeof fetch=fetch):Promise<{messageId:string}>{
  validateDeliveryConfig(config);
  const recipient=normalizePakistanWhatsappPhone(input.recipient);
  if(!/^\d{4}$/.test(input.invoiceNumber)||input.pdf.length<100||input.pdf.length>4_000_000||
    new TextDecoder().decode(input.pdf.slice(0,5))!=='%PDF-')throw new DeliveryError('failed');
  const base='https://graph.facebook.com/'+config.apiVersion+'/'+config.phoneNumberId;
  const headers={Authorization:'Bearer '+config.accessToken};
  const form=new FormData();form.set('messaging_product','whatsapp');form.set('type','application/pdf');
  form.set('file',new Blob([new Uint8Array(input.pdf)],{type:'application/pdf'}),'apex-invoice-'+input.invoiceNumber+'.pdf');
  let mediaId:string;
  try{
    const uploaded=await fetcher(base+'/media',{method:'POST',headers,body:form,redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(!uploaded.ok)throw new Error('Upload rejected');
    const media=await boundedJson(uploaded);
    if(typeof media.id!=='string'||!/^\d{5,40}$/.test(media.id))throw new Error('Invalid media ID');mediaId=media.id;
  }catch{throw new DeliveryError('failed');} // Media upload cannot send a customer message.
  let response:Response;
  try{response=await fetcher(base+'/messages',{method:'POST',headers:{...headers,'Content-Type':'application/json'},
    redirect:'manual',signal:AbortSignal.timeout(15000),body:JSON.stringify({messaging_product:'whatsapp',to:recipient,
      type:'template',template:{name:config.template,language:{code:config.language},components:[
        {type:'header',parameters:[{type:'document',document:{id:mediaId,filename:'apex-invoice-'+input.invoiceNumber+'.pdf'}}]},
        {type:'body',parameters:[{type:'text',text:input.invoiceNumber}]}]}})});
  }catch{throw new DeliveryError('ambiguous');}
  // A proxy timeout/HTML error is not proof Meta rejected the send. Require an
  // explicit Graph client error before permitting another customer message.
  if(!response.ok){
    let rejected=false;
    if(response.status>=400&&response.status<500&&response.status!==408){
      try{const data=await boundedJson(response);const e=data.error as {code?:unknown;type?:unknown}|undefined;
        rejected=!data.messages&&!!e&&Number.isSafeInteger(e.code)&&typeof e.type==='string'&&e.type.length>0;
      }catch{/* Unknown response remains ambiguous. */}
    }
    throw new DeliveryError(rejected?'failed':'ambiguous');
  }
  try{const data=await boundedJson(response);const messages=data.messages;
    if(!Array.isArray(messages)||messages.length!==1||typeof messages[0]?.id!=='string'||
      !/^wamid\.[A-Za-z0-9+/=_-]{8,500}$/.test(messages[0].id))throw new Error('Missing message ID');
    return {messageId:messages[0].id};
  }catch{throw new DeliveryError('ambiguous');}
}
export function verifyInvoiceWebhook(raw:Uint8Array,signature:string|null,secret:string):boolean{
  if(secret.length<20||raw.length>262144||!signature||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
  const expected=createHmac('sha256',secret).update(raw).digest();
  return timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex'));
}
export type DeliveryWebhookEvent={messageId:string;recipient:string;state:'provider_accepted'|'delivered'|'failed';timestamp:number;errorCode?:number};
/** Call only after exact-byte signature verification. Discard inbound message/care payloads. */
export function parseInvoiceWebhook(raw:Uint8Array,phoneNumberId:string):DeliveryWebhookEvent[]{
  if(raw.length>262144||!/^\d{8,30}$/.test(phoneNumberId))throw new Error('Invalid webhook');
  const data=JSON.parse(new TextDecoder().decode(raw));
  if(data?.object!=='whatsapp_business_account'||!Array.isArray(data.entry))throw new Error('Invalid webhook');
  const events:DeliveryWebhookEvent[]=[];
  for(const entry of data.entry)for(const change of entry.changes??[]){
    const value=change.value;if(change.field!=='messages'||value?.metadata?.phone_number_id!==phoneNumberId)continue;
    for(const s of value.statuses??[]){
      if(!/^wamid\.[A-Za-z0-9+/=_-]{8,500}$/.test(s.id??'')||!/^923\d{9}$/.test(s.recipient_id??'')||
        !/^\d{10,12}$/.test(s.timestamp??'')||!['sent','delivered','read','failed'].includes(s.status))continue;
      const timestamp=Number(s.timestamp);if(!Number.isSafeInteger(timestamp))continue;
      const errorCode=s.errors?.[0]?.code;
      events.push({messageId:s.id,recipient:s.recipient_id,timestamp,state:s.status==='sent'?'provider_accepted':
        s.status==='failed'?'failed':'delivered',...(Number.isSafeInteger(errorCode)?{errorCode}:{})});
    }
  }
  return events;
}
/** Delivery/read evidence wins; late accepted/failed notifications never undo delivery. */
export function webhookState(current:DeliveryState,event:DeliveryWebhookEvent['state']):DeliveryState{
  if(current==='delivered')return current;
  if(event==='delivered')return 'delivered';
  if(current==='failed'||current==='ambiguous')return current;
  return event;
}
