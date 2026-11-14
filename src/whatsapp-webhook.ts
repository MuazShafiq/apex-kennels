import type {WorkerEnv} from './cloudflare-worker.ts';
import {parseInvoiceWebhook,verifyInvoiceWebhook} from './invoice-delivery.ts';
import {applyInvoiceWebhook} from './invoice-delivery-store.ts';
import {applyOwnerAlertWebhook} from './owner-alert-store.ts';

type WebhookDeps={applyInvoiceWebhook?:typeof applyInvoiceWebhook;applyOwnerAlertWebhook?:typeof applyOwnerAlertWebhook};
const response=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
class BodyError extends Error{readonly status:number;constructor(status:number,message:string){super(message);this.status=status;}}
async function rawBody(request:Request):Promise<Uint8Array>{
  if(!request.body)throw new BodyError(400,'Empty request');
  const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      size+=value.length;
      if(size>262144){await reader.cancel();throw new BodyError(413,'Request too large');}
      parts.push(value);
    }
  }finally{reader.releaseLock();}
  const raw=new Uint8Array(size);let offset=0;
  for(const part of parts){raw.set(part,offset);offset+=part.length;}
  return raw;
}

/** One Meta app callback, with independent replay-safe persistence in both lanes.
 * This route never dispatches messages and remains available with send gates off.
 */
export async function whatsappWebhookRoute(request:Request,env:WorkerEnv,deps:WebhookDeps={}):Promise<Response>{
  if(!env.DATABASE_URL?.trim()||!env.WHATSAPP_WEBHOOK_SECRET||env.WHATSAPP_WEBHOOK_SECRET.length<20||
    !env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim()||!/^\d{8,30}$/.test(env.WHATSAPP_PHONE_NUMBER_ID??''))return response('Webhook is not configured',503);
  const url=new URL(request.url);
  if(request.method==='GET'){
    if(url.searchParams.get('hub.mode')!=='subscribe'||url.searchParams.get('hub.verify_token')!==env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)return response('Forbidden',403);
    const challenge=url.searchParams.get('hub.challenge')??'';
    if(!/^\d{1,100}$/.test(challenge))return response('Invalid challenge',400);
    return new Response(challenge,{headers:{'Cache-Control':'no-store','Content-Type':'text/plain'}});
  }
  if(request.method!=='POST')return response('Method not allowed',405);
  try{
    const raw=await rawBody(request);
    if(!verifyInvoiceWebhook(raw,request.headers.get('x-hub-signature-256'),env.WHATSAPP_WEBHOOK_SECRET))return response('Forbidden',403);
    const events=parseInvoiceWebhook(raw,env.WHATSAPP_PHONE_NUMBER_ID!);
    if(events.length){
      // A later failure can leave the first transaction committed. Return 503;
      // Meta's replay safely deduplicates that lane and completes the other.
      await (deps.applyInvoiceWebhook??applyInvoiceWebhook)(env.DATABASE_URL,events);
      await (deps.applyOwnerAlertWebhook??applyOwnerAlertWebhook)(env.DATABASE_URL,events);
    }
    return new Response('OK',{headers:{'Cache-Control':'no-store'}});
  }catch(error){return response(error instanceof BodyError?error.message:'Webhook could not be processed',error instanceof BodyError?error.status:503);}
}
