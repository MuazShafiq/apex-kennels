import {renderOwnerAlerts} from './staff-owner-alerts.ts';
import type {WorkerEnv} from './cloudflare-worker.ts';
import {verifyInvoiceWebhook,parseInvoiceWebhook} from './invoice-delivery.ts';
import {listOwnerAlerts,loadOwnerAlert,dispatchOwnerAlert,retryOwnerAlert,reconcileOwnerAlert,applyOwnerAlertWebhook} from './owner-alert-store.ts';
import type {OwnerAlertConfig} from './owner-booking-alerts.ts';
class AlertRouteError extends Error{readonly status:number;constructor(message:string,status:number){super(message);this.status=status;}}
const response=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export const ownerAlertConfig=(env:WorkerEnv):OwnerAlertConfig=>({enabled:env.WHATSAPP_ALERTS_ENABLED,accessToken:env.WHATSAPP_ACCESS_TOKEN??'',phoneNumberId:env.WHATSAPP_PHONE_NUMBER_ID??'',apiVersion:env.WHATSAPP_GRAPH_VERSION??'',recipient:env.WHATSAPP_OWNER_PHONE??'',template:env.WHATSAPP_OWNER_ALERT_TEMPLATE??'',consentedAt:env.WHATSAPP_OWNER_CONSENT_AT??'',consentEvidence:env.WHATSAPP_OWNER_CONSENT_EVIDENCE??''});
const services={listOwnerAlerts,loadOwnerAlert,dispatchOwnerAlert,retryOwnerAlert,reconcileOwnerAlert,applyOwnerAlertWebhook};
export type OwnerAlertDeps=Partial<typeof services>;
async function rawBody(request:Request,limit:number):Promise<Uint8Array>{
  if(!request.body)throw new AlertRouteError('Empty request',400);
  const reader=request.body.getReader();const parts:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new AlertRouteError('Request too large',413);}parts.push(value);}}finally{reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return result;
}
export async function ownerWebhookRoute(request:Request,env:WorkerEnv,deps:OwnerAlertDeps={}):Promise<Response>{
  if(!env.DATABASE_URL||!env.WHATSAPP_ALERT_WEBHOOK_SECRET||!env.WHATSAPP_PHONE_NUMBER_ID)return response('Webhook is not configured',503);
  const url=new URL(request.url);
  if(request.method==='GET'){
    // Verification token is independent from the app signing secret.
    if(!env.WHATSAPP_ALERT_WEBHOOK_VERIFY_TOKEN||url.searchParams.get('hub.mode')!=='subscribe'||url.searchParams.get('hub.verify_token')!==env.WHATSAPP_ALERT_WEBHOOK_VERIFY_TOKEN)return response('Forbidden',403);
    const challenge=url.searchParams.get('hub.challenge')??'';
    if(!/^\d{1,100}$/.test(challenge))return response('Invalid challenge',400);
    return new Response(challenge,{headers:{'Cache-Control':'no-store','Content-Type':'text/plain'}});
  }
  if(request.method!=='POST')return response('Method not allowed',405);
  try{
    const raw=await rawBody(request,262144);
    if(!verifyInvoiceWebhook(raw,request.headers.get('x-hub-signature-256'),env.WHATSAPP_ALERT_WEBHOOK_SECRET))return response('Forbidden',403);
    await (deps.applyOwnerAlertWebhook??applyOwnerAlertWebhook)(env.DATABASE_URL,parseInvoiceWebhook(raw,env.WHATSAPP_PHONE_NUMBER_ID));
    return new Response('OK',{headers:{'Cache-Control':'no-store'}});
  }catch(e){return response(e instanceof AlertRouteError?e.message:'Webhook could not be processed',e instanceof AlertRouteError?e.status:503);}
}


export async function ownerAlertRoute(request:Request,env:WorkerEnv,email?:string,deps:OwnerAlertDeps={}):Promise<Response>{
  const url=new URL(request.url);
  if(url.pathname==='/api/owner-alerts/webhook')return ownerWebhookRoute(request,env,deps);
  if(!email||email!==env.WHATSAPP_OWNER_EMAIL?.trim().toLowerCase())return response('Forbidden',403);
  if(!env.DATABASE_URL)return response('Database not configured',503);
  const action=url.pathname.split('/').pop();
  const api={...services,...deps};
  try{
    let values:URLSearchParams;
    if(request.method==='GET'&&url.pathname==='/staff/owner-alerts')values=url.searchParams;
    else if(request.method==='POST'&&['retry','reconcile'].includes(action??'')&&url.pathname==='/staff/owner-alerts/'+action){
      if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return response('Forbidden',403);
      if(!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return response('Expected browser form',415);
      if(url.search)return response('Invalid action URL',400);
      values=new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(await rawBody(request,4096)));
      const allowed=action==='retry'?['id','confirmed']:['id','confirmed','messageId','confirmedNotSent','evidence','deliveryState'];
      if([...values.keys()].some(k=>!allowed.includes(k)||values.getAll(k).length!==1)||values.get('confirmed')!=='true')return response('Explicit confirmation required',400);
    }else return response('Not found',404);
    if(request.method==='GET'&&url.pathname==='/staff/owner-alerts'&&!url.searchParams.has('id')){
      if([...url.searchParams.keys()].some(k=>k!=='page')||url.searchParams.getAll('page').length>1||!/^\d{1,5}$/.test(url.searchParams.get('page')??'0'))return response('Invalid page',400);
      const page=Number(url.searchParams.get('page')??'0');
      const rows=await api.listOwnerAlerts(env.DATABASE_URL,undefined,page*100);
      return new Response(renderOwnerAlerts(rows,env.WHATSAPP_ALERTS_ENABLED==='true',page),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
    }
    const id=values.get('id')??'';
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))return response('Invalid booking reference',400);
    if(request.method==='POST'){
      if(action==='retry'){
        // Retry only queues; cron sends later, and still honors the enablement and consent gates.
        await api.retryOwnerAlert(env.DATABASE_URL,id,email);
      }else await api.reconcileOwnerAlert(env.DATABASE_URL,id,email,{messageId:values.get('messageId')||undefined,confirmedNotSent:values.get('confirmedNotSent')==='true',evidence:values.get('evidence')??'',deliveryState:values.get('deliveryState')||undefined});
      return new Response(null,{status:303,headers:{Location:'/staff/owner-alerts?id='+id,'Cache-Control':'no-store'}});
    }
    if([...values.keys()].some(k=>k!=='id')||values.getAll('id').length!==1)return response('Invalid request',400);
    const alert=await api.loadOwnerAlert(env.DATABASE_URL,id);
    return new Response(renderOwnerAlerts(alert?[{bookingId:id,...alert}]:[],env.WHATSAPP_ALERTS_ENABLED==='true'),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
  }catch(error){return response(error instanceof AlertRouteError?error.message:'Alert operation unavailable; inspect configuration and reconciliation state',error instanceof AlertRouteError?error.status:503);}
}
