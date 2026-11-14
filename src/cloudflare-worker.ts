import {renderCanvaStaffPdf} from './canva-invoice-pdf.ts';
import {invoiceStaffRoute,invoiceWebhookRoute,type InvoiceWorkflowDeps} from './invoice-workflow-routes.ts';
import {renderStaffTransportForm,renderStaffTransportResult,
  parseStaffTransportSelection} from './staff-transport-review.ts';
import {preparePinnedTransportDraft} from './transport-quote-from-pins.ts';
import {APEX_KENNEL_LOCATION,APEX_KENNEL_ACCESS} from './apex-location-config.ts';
import type {RouteResult} from './transport-route.ts';
import type {PetrolRateResult} from './islamabad-petrol-rate.ts';
import { timingSafeEqual } from 'node:crypto';
import {verifiedAccessEmail} from './staff-access-jwt.ts';
import {makeReviewSnapshot,saveReviewDraft,loadSavedReview,DraftSaveError,type ReviewSnapshot,type SavedReview,type SaveReviewResult} from './staff-saved-review.ts';
import {type OwnerAlertIntent,validateOwnerAlertConfig,isSyntheticAlertBooking} from './owner-booking-alerts.ts';
import {dispatchOwnerAlert,sweepOwnerAlerts} from './owner-alert-store.ts';
import {ownerAlertRoute,ownerAlertConfig,type OwnerAlertDeps} from './owner-alert-routes.ts';
import {isTransportServiceLocation} from './transport-service-area.ts';
import { IntakeError, parseIntake, type IntakeRequest } from './intake.ts';
import {parsePublicBookingEnvelope,verifyBookingChallenge} from './public-booking.ts';
import { persistBookingWithNeon } from './neon-worker-db.ts';
import type { SavedBooking } from './booking-store.ts';
import {listStaffBookings,parseStaffFilter,syntheticBookings, type StaffBooking, type StaffFilter} from './staff-bookings.ts';
import {renderStaffConsoleHtml} from './staff-console.ts';
import {readStaffInvoiceSource,parseStaffDraftRequest,prepareStaffDraftReview,renderStaffDraftReview,type StaffInvoiceSource} from './staff-invoice-draft.ts';
import {resolveSharedGoogleMapsPin,type SharedPinResolution} from './shared-map-pin.ts';
import {readPinForm,renderStaffPinChecker} from './staff-location.ts';
import {readStaffBookingDetail,renderStaffBookingDetail,parseStaffBookingId,type StaffBookingDetail} from './staff-booking-detail.ts';

export type WorkerEnv = {
  APEX_INVOICE_APPROVAL_ENABLED?:string;
  APEX_INVOICE_ISSUANCE_ENABLED?:string;
  APEX_INVOICE_OWNER_EMAIL?:string;
  APEX_INVOICE_BANK_JSON?:string;
  APEX_INVOICE_MANUAL_NUMBER_FLOOR?:string;
  APEX_INVOICE_WHATSAPP_ENABLED?:string;
  APEX_INVOICE_WHATSAPP_TEMPLATE?:string;
  APEX_INVOICE_WHATSAPP_LANGUAGE?:string;
  APEX_INVOICE_WEBHOOK_SECRET?:string;
  APEX_INVOICE_WEBHOOK_VERIFY_TOKEN?:string;
  DATABASE_URL?: string;
  INTAKE_API_SECRET?: string;
  STAFF_ACCESS_AUD?: string;
  STAFF_ACCESS_ISSUER?: string;
  STAFF_ALLOWED_EMAILS?: string;
  APEX_PUBLIC_BOOKING_ENABLED?: string;
  APEX_STAFF_DRAFTS_ENABLED?: string;
  GEOAPIFY_API_KEY?:string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  ASSETS?: {fetch(request:Request):Promise<Response>};
  WHATSAPP_ALERTS_ENABLED?: string;
  WHATSAPP_OWNER_EMAIL?:string;
  WHATSAPP_OWNER_CONSENT_AT?:string;
  WHATSAPP_OWNER_CONSENT_EVIDENCE?:string;
  WHATSAPP_ALERT_WEBHOOK_SECRET?:string;
  WHATSAPP_ALERT_WEBHOOK_VERIFY_TOKEN?:string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_GRAPH_VERSION?: string;
  WHATSAPP_OWNER_PHONE?: string;
  WHATSAPP_OWNER_ALERT_TEMPLATE?: string;
};

export type SaveIntake = (databaseUrl: string, input: IntakeRequest, alert?:OwnerAlertIntent) => Promise<SavedBooking>;
export type StaffList = (databaseUrl: string, filter: StaffFilter) => Promise<StaffBooking[]>;
export type StaffContext = {access?: {aud: string; getIdentity(): Promise<{email?:string}|null>}; waitUntil?:(task:Promise<unknown>)=>void};
export type StaffDraftReader=(databaseUrl:string,bookingId:string)=>Promise<StaffInvoiceSource|null>;
export type StaffDetailReader=(databaseUrl:string,bookingId:string)=>Promise<StaffBookingDetail|null>;
export type StaffOptions = {context?: StaffContext; list?: StaffList; draft?:StaffDraftReader; detail?:StaffDetailReader; resolvePin?:(url:string)=>Promise<SharedPinResolution>; verifyChallenge?:(token:string,secret:string,hostname:string)=>Promise<boolean>; ownerAlerts?:OwnerAlertDeps; saveReview?:(url:string,snapshot:ReviewSnapshot,revision:number,email:string)=>Promise<SaveReviewResult>; loadReview?:(url:string,bookingId:string)=>Promise<SavedReview|null>;
  transportRoute?:()=>Promise<RouteResult>; transportFuel?:()=>Promise<PetrolRateResult>;
  invoiceWorkflow?:InvoiceWorkflowDeps;
};

async function authorizedStaff(env: WorkerEnv, context: StaffContext|undefined, request:Request): Promise<string|null> {
  if (!env.STAFF_ACCESS_AUD || !env.STAFF_ALLOWED_EMAILS) return null;
  const allow = env.STAFF_ALLOWED_EMAILS.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if (!allow.length) return null;
  let email:string|null=null;
  if(context?.access){
    // Cloudflare already validated the identity. Never fall back to a header if
    // an Access identity is present but its audience or claims are invalid.
    if(context.access.aud!==env.STAFF_ACCESS_AUD)return null;
    try{email=(await context.access.getIdentity())?.email?.trim().toLowerCase()??null;}
    catch{return null;}
  }else{
    // Workers Static Assets' internal router can drop ctx.access. Validate
    // the signed Access JWT against the configured trusted issuer instead.
    email=await verifiedAccessEmail(request.headers.get('Cf-Access-Jwt-Assertion'),
      env.STAFF_ACCESS_ISSUER,env.STAFF_ACCESS_AUD);
  }
  return email&&allow.includes(email)?email:null;
}

/** Missing configuration fails closed for messaging, preserving legacy intake. */
function ownerIntent(env:WorkerEnv):OwnerAlertIntent|undefined {
  if(env.WHATSAPP_ALERTS_ENABLED!=='true')return;
  try{return validateOwnerAlertConfig(ownerAlertConfig(env));}
  catch{console.warn('Owner alerts unavailable: configuration or explicit consent missing');return;}
}
async function notifyOwnerOfNewBooking(env:WorkerEnv,input:IntakeRequest,saved:SavedBooking,staff:StaffOptions):Promise<void>{
  if(!saved.created||!ownerIntent(env)||isSyntheticAlertBooking(input))return;
  const task=(staff.ownerAlerts?.dispatchOwnerAlert??dispatchOwnerAlert)(env.DATABASE_URL!,saved.bookingId,ownerAlertConfig(env))
    .catch(()=>{console.warn('Owner alert dispatch deferred; inspect durable alert state');});
  if(staff.context?.waitUntil)staff.context.waitUntil(task);else await task;
}

function html(body: string):Response {
  return new Response(body, {status:200,headers:{
    'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
    'X-Robots-Tag':'noindex, nofollow',
    'Content-Security-Policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  }});
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

/** All invoice viewing and downloads use Fatima's original Canva PDF. Never fall back to legacy HTML. */
async function canvaInvoiceResponse(
  env:WorkerEnv,request:Request,snapshot:ReviewSnapshot,reviewDate:string,download=false
):Promise<Response>{
  if(!env.ASSETS)return json({error:'Canva invoice template unavailable'},503);
  const url=new URL('/invoice/canva-blank.pdf',request.url);
  const template=await env.ASSETS.fetch(new Request(url));
  if(!template.ok)return json({error:'Canva invoice template unavailable'},503);
  const bytes=await renderCanvaStaffPdf(snapshot,reviewDate,
    new Uint8Array(await template.arrayBuffer()));
  return new Response(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}),{
    headers:{
      'Content-Type':'application/pdf',
      'Content-Disposition':(download?'attachment':'inline')+
        '; filename="apex-canva-invoice-preview.pdf"',
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff',
      'X-Robots-Tag':'noindex, nofollow'
    }
  });
}

/** Small, same-origin URL-encoded staff form; no uploads or JSON mutation. */
async function boundedForm(request:Request):Promise<URLSearchParams>{
  const length=request.headers.get('content-length');
  if(length!==null&&(!/^\d{1,8}$/.test(length)||Number(length)>2048))
    throw new DraftSaveError('Invalid form size',413);
  if(!request.body)throw new DraftSaveError('Empty form',400);
  const reader=request.body.getReader();
  const chunks:Uint8Array[]=[];let total=0;
  try {
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>2048)throw new DraftSaveError('Form too large',413);
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const body=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  return new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(body));
}

function bearerAuthorized(header: string | null, configuredSecret: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const provided = Buffer.from(header.slice(7), 'utf8');
  const expected = Buffer.from(configuredSecret, 'utf8');
  return expected.length >= 32 && provided.length === expected.length &&
    timingSafeEqual(provided, expected);
}

async function limitedJson(request: Request): Promise<unknown> {
  const limit = 16_384;
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > limit) {
    throw new IntakeError('Request too large', 413);
  }

  if (!request.body) throw new IntakeError('Invalid JSON');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new IntakeError('Request too large', 413);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/** Exported for request-level unit testing with injected fake persistence. */
export async function handleWorkerRequest(
  request: Request,
  env: WorkerEnv,
  persist: SaveIntake = persistBookingWithNeon,
  staff: StaffOptions = {},
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if(path==='/api/owner-alerts/webhook')return ownerAlertRoute(request,env,undefined,staff.ownerAlerts);
  if(path.startsWith('/staff/owner-alerts')){
    const email=await authorizedStaff(env,staff.context,request);
    if(!email||!env.WHATSAPP_OWNER_EMAIL||email!==env.WHATSAPP_OWNER_EMAIL.trim().toLowerCase())return json({error:'Forbidden'},403);
    if(request.method==='POST'){
      const recent=await verifiedAccessEmail(request.headers.get('Cf-Access-Jwt-Assertion'),env.STAFF_ACCESS_ISSUER,env.STAFF_ACCESS_AUD??'',fetch,300);
      if(recent!==email)return json({error:'Reauthenticate with Cloudflare Access'},403);
    }
    return ownerAlertRoute(request,env,email,staff.ownerAlerts);
  }
  if(path==='/api/invoice-delivery/webhook')return invoiceWebhookRoute(request,env,staff.invoiceWorkflow);
  if(path.startsWith('/staff/invoices/')){
    if(env.APEX_INVOICE_APPROVAL_ENABLED!=='true')return json({error:'Invoice workflow is disabled'},503);
    const email=await authorizedStaff(env,staff.context,request);
    if(!email||!env.APEX_INVOICE_OWNER_EMAIL||email!==env.APEX_INVOICE_OWNER_EMAIL.trim().toLowerCase())return json({error:'Forbidden'},403);
    if(request.method==='POST'){
      // A fresh signed Access assertion is mandatory even when ctx.access exists.
      const recent=await verifiedAccessEmail(request.headers.get('Cf-Access-Jwt-Assertion'),env.STAFF_ACCESS_ISSUER,env.STAFF_ACCESS_AUD??'',fetch,300);
      if(recent!==email)return json({error:'Reauthenticate with Cloudflare Access before approving, issuing or sending an invoice'},403);
    }
    return invoiceStaffRoute(request,env,email,staff.invoiceWorkflow);
  }
  if (path === '/api/health') {
    if (request.method !== 'GET') return json({error:'Method not allowed'}, 405, {Allow:'GET'});
    return json({status:'ok',service:'apex-intake'});
  }
  if(path==='/book'||path==='/book/'||path.startsWith('/book/')){
    if(request.method!=='GET')return json({error:'Method not allowed'},405,{Allow:'GET'});
    if(!env.ASSETS)return json({error:'Booking page unavailable'},503);
    try{
      const url=new URL(request.url);
      if(path==='/book'||path==='/book/')url.pathname='/book/index.html';
      const response=await env.ASSETS.fetch(new Request(url.toString(),{method:'GET'}));
      const headers=new Headers(response.headers);
      headers.set('X-Content-Type-Options','nosniff');
      headers.set('X-Robots-Tag','noindex, nofollow');
      headers.set('Content-Security-Policy',
        "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; "+
        "style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; "+
        "frame-src https://challenges.cloudflare.com; form-action 'self'; "+
        "base-uri 'none'; frame-ancestors 'none'");
      return new Response(response.body,{status:response.status,headers});
    }catch{return json({error:'Booking page unavailable'},503);}
  }
  // Customers can choose a precise point in the Google Maps app and paste
  // its share link. Resolve only allowlisted Google URLs, never arbitrary pages.
  if(path==='/api/book/location'){
    if(request.method!=='POST')return json({error:'Method not allowed'},405,{Allow:'POST'});
    if(request.headers.get('origin')!==new URL(request.url).origin)
      return json({error:'Forbidden'},403);
    if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
      return json({error:'JSON required'},415);
    let raw:string;
    try{
      const body=await limitedJson(request);
      if(!body||typeof body!=='object'||Array.isArray(body)||
         Object.keys(body).join(',')!=='link'||
         typeof (body as {link?:unknown}).link!=='string')throw new Error();
      raw=(body as {link:string}).link.trim();
      if(raw.length<3||raw.length>2048)throw new Error();
    }catch{return json({error:'Paste a Google Maps link or latitude, longitude coordinates.',code:'INVALID_LINK'},400);}
    const resolved=await (staff.resolvePin??resolveSharedGoogleMapsPin)(raw);
    if(!resolved.ok){
      if(resolved.reason==='REDIRECT_UNAVAILABLE')
        return json({error:'This Maps short link could not be opened. Copy the exact latitude, longitude of your gate from Google Maps and paste it here instead.',code:'LINK_UNAVAILABLE'},422);
      if(resolved.reason==='UNSUPPORTED_LINK')
        return json({error:'Use a Google Maps location link or latitude, longitude coordinates.',code:'UNSUPPORTED_LINK'},422);
      return json({error:'This Maps link does not expose an exact pin. Long-press your gate in Google Maps, then paste its latitude, longitude here. We will not guess from the map centre.',code:'NOT_EXACT_PIN'},422);
    }
    if(!isTransportServiceLocation(resolved.pin.lat,resolved.pin.lon))
      return json({error:'Pickup and drop-off are available only within Islamabad and Rawalpindi',code:'OUT_OF_SERVICE_AREA'},422);
    return json({latitude:resolved.pin.lat,longitude:resolved.pin.lon,
      mapsUrl:'https://www.google.com/maps/search/?api=1&query='+
        encodeURIComponent(resolved.pin.lat+','+resolved.pin.lon)});
  }
  if(path==='/api/book/config'){
    if(request.method!=='GET')return json({error:'Method not allowed'},405,{Allow:'GET'});
    const enabled=env.APEX_PUBLIC_BOOKING_ENABLED==='true' && !!env.DATABASE_URL &&
      !!env.TURNSTILE_SITE_KEY && !!env.TURNSTILE_SECRET_KEY;
    return json(enabled?{enabled:true,siteKey:env.TURNSTILE_SITE_KEY}:{enabled:false});
  }
  if(path==='/api/book'){
    if(request.method!=='POST')return json({error:'Method not allowed'},405,{Allow:'POST'});
    if(env.APEX_PUBLIC_BOOKING_ENABLED!=='true'||!env.DATABASE_URL||
       !env.TURNSTILE_SECRET_KEY||!env.TURNSTILE_SITE_KEY)
      return json({error:'Online booking is not available yet'},503);
    const url=new URL(request.url);
    if(request.headers.get('origin')!==url.origin)return json({error:'Forbidden'},403);
    if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
      return json({error:'JSON required'},415);
    let parsed:ReturnType<typeof parsePublicBookingEnvelope>;
    try{parsed=parsePublicBookingEnvelope(await limitedJson(request));}
    catch(error){
      if(error instanceof IntakeError)return json({error:error.message},error.status);
      return json({error:'Check the booking form and try again'},400);
    }
    const challengeValid=await (staff.verifyChallenge??verifyBookingChallenge)(
      parsed.turnstileToken,env.TURNSTILE_SECRET_KEY,url.hostname);
    if(!challengeValid)return json({error:'Verification expired. Please verify and try again.'},403);
    try{
      const saved=await persist(env.DATABASE_URL,parsed.booking,ownerIntent(env));
      await notifyOwnerOfNewBooking(env,parsed.booking,saved,staff);
      return json({ok:true,reference:saved.bookingId.slice(0,8)},saved.created?201:200);
    }catch(error){
      if(error instanceof IntakeError)return json({error:'Booking details changed. Please contact Apex.'},409);
      return json({error:'Unable to save the request. Please contact Apex.'},500);
    }
  }
  if (path === '/demo/invoice') {
    if (request.method !== 'GET') return json({error:'Method not allowed'},405,{Allow:'GET'});
    try{
      const demo:StaffInvoiceSource={
        bookingId:'00000000-0000-4000-8000-000000000001',
        customerName:'SYNTHETIC OWNER',petNames:'SYNTHETIC PET',petBreeds:'Sample breed',
        petCount:1,startDate:'2026-12-10',endDate:'2026-12-12',
        status:'requested',cameraCageRequested:false,transportRequested:false,synthetic:true
      };
      const snapshot=makeReviewSnapshot(prepareStaffDraftReview(demo,'daily'));
      return await canvaInvoiceResponse(env,request,snapshot,'2026-11-07');
    }catch{return json({error:'Canva demo invoice unavailable'},503);}
  }
  if (path === '/demo/staff') {
    if (request.method !== 'GET') return json({error:'Method not allowed'},405,{Allow:'GET'});
    try {
      const filter=parseStaffFilter(new URL(request.url));
      return html(renderStaffConsoleHtml(syntheticBookings,{demo:true,filter}));
    } catch { return json({error:'Invalid filter'},400); }
  }
  if (path === '/demo/draft') {
    if (request.method !== 'GET') return json({error:'Method not allowed'},405,{Allow:'GET'});
    const url=new URL(request.url);
    const selected=url.searchParams.get('package')??'daily';
    if(selected!=='daily'&&selected!=='monthly')return json({error:'Invalid package choice'},400);
    const source:StaffInvoiceSource={
      bookingId:'00000000-0000-4000-8000-000000000001',
      customerName:'Sample Owner A',petNames:'Dog 01',petCount:1,
      startDate:'2026-12-10',endDate:'2026-12-12',
      status:'requested',cameraCageRequested:false,transportRequested:true,synthetic:true
    };
    return html(renderStaffDraftReview(prepareStaffDraftReview(source,selected),'demo'));
  }
  if (path === '/staff/location') {
    if(request.method!=='GET'&&request.method!=='POST'){
      return json({error:'Method not allowed'},405,{Allow:'GET, POST'});
    }
    if(!env.STAFF_ACCESS_AUD||!env.STAFF_ALLOWED_EMAILS){
      return json({error:'Staff access not configured'},503);
    }
    const email=await authorizedStaff(env,staff.context,request);
    if(!email)return json({error:'Forbidden'},403);
    if(request.method==='GET')return html(renderStaffPinChecker());
    // Same-origin HTML forms only: no CORS, no cross-site POST, no hidden writes.
    if(request.headers.get('origin')!==new URL(request.url).origin){
      return json({error:'Forbidden'},403);
    }
    let sharedUrl:string;
    try{sharedUrl=await readPinForm(request);}
    catch{return json({error:'Invalid location form'},400);}
    try{
      const result=await (staff.resolvePin??resolveSharedGoogleMapsPin)(sharedUrl);
      return html(renderStaffPinChecker(result));
    }catch{return json({error:'Location lookup failed'},502);}
  }
  if (path === '/staff/booking') {
    if(request.method!=='GET')return json({error:'Method not allowed'},405,{Allow:'GET'});
    if(!env.STAFF_ACCESS_AUD||!env.STAFF_ALLOWED_EMAILS||!env.DATABASE_URL){
      return json({error:'Staff access not configured'},503);
    }
    const email=await authorizedStaff(env,staff.context,request);
    if(!email)return json({error:'Forbidden'},403);
    let id:string;
    try{id=parseStaffBookingId(new URL(request.url));}
    catch{return json({error:'Invalid booking ID'},400);}
    try{
      const detail=await (staff.detail??readStaffBookingDetail)(env.DATABASE_URL,id);
      if(!detail)return json({error:'Booking not found'},404);
      return html(renderStaffBookingDetail(detail));
    }catch{return json({error:'Internal server error'},500);}
  }
  if(path==='/staff/transport'){
    if(request.method!=='GET'&&request.method!=='POST')
      return json({error:'Method not allowed'},405,{Allow:'GET, POST'});
    if(env.APEX_STAFF_DRAFTS_ENABLED!=='true')
      return json({error:'Staff estimates are not enabled'},503);
    if(!env.STAFF_ACCESS_AUD||!env.STAFF_ALLOWED_EMAILS||!env.DATABASE_URL)
      return json({error:'Staff access not configured'},503);
    const email=await authorizedStaff(env,staff.context,request);
    if(!email)return json({error:'Forbidden'},403);
    try{
      if(request.method==='GET'){
        const url=new URL(request.url);
        // Chat apps may append attribution fields to staff links.
        // Ignore only known inert UTM parameters, never duplicate IDs.
        const attribution=new Set(['utm_source','utm_medium','utm_campaign','utm_term','utm_content']);
        if([...url.searchParams.keys()].some(k=>k!=='id'&&!attribution.has(k))||
           url.searchParams.getAll('id').length!==1)
          return json({error:'Invalid booking reference'},400);
        let id:string;
        try{id=parseStaffBookingId(url);}
        catch{return json({error:'Invalid booking reference'},400);}
        const source=await (staff.draft??readStaffInvoiceSource)(env.DATABASE_URL,id);
        if(!source)return json({error:'Booking not found'},404);
        if(source.transportRequested!==true)
          return json({error:'This booking did not request transport'},409);
        const review=prepareStaffDraftReview(source,'auto');
        const saved=await (staff.loadReview??loadSavedReview)(env.DATABASE_URL,id);
        return html(renderStaffTransportForm(source,review.packageChoice,saved?.revision??0));
      }
      // The only mutation is a signed-in staff member explicitly saving a review.
      if(request.headers.get('origin')!==new URL(request.url).origin||
         request.headers.get('sec-fetch-site')==='cross-site')
        return json({error:'Forbidden'},403);
      if(!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers.get('content-type')??''))
        return json({error:'Expected browser form'},415);
      let selected:ReturnType<typeof parseStaffTransportSelection>;
      try{selected=parseStaffTransportSelection(await boundedForm(request));}
      catch(error){
        if(error instanceof DraftSaveError)return json({error:error.message},error.status);
        return json({error:error instanceof Error?error.message:'Invalid transport request'},400);
      }
      const source=await (staff.draft??readStaffInvoiceSource)(env.DATABASE_URL,selected.bookingId);
      if(!source)return json({error:'Booking not found'},404);
      if(source.transportRequested!==true)
        return json({error:'This booking did not request transport'},409);
      const review=prepareStaffDraftReview(source,selected.packageChoice);
      if(!review.draft)return json({error:'Incomplete boarding estimate'},409);
      const result=await preparePinnedTransportDraft({
        startDate:source.startDate,endDate:source.endDate,
        cage:source.cameraCageRequested?'camera':'normal',
        petCount:source.petCount,fullMonthPackageSelected:selected.packageChoice==='monthly',
        transport:{requested:true}
      },{
        kennelPin:APEX_KENNEL_LOCATION.pin,
        kennelAccessWaypoint:APEX_KENNEL_ACCESS.pin,
        customerPin:selected.customerPin,
        dropoffPin:selected.dropoffPin,dropoffPinConfirmed:selected.dropoffConfirmed,
        kennelPinConfirmed:selected.kennelConfirmed,
        kennelAccessWaypointConfirmed:selected.accessConfirmed,
        customerPinConfirmed:selected.customerConfirmed,
        visit:selected.visit==='both'?'pickup_and_dropoff':selected.visit
      },{
        geoapifyKey:env.GEOAPIFY_API_KEY,
        route:staff.transportRoute,fetchFuel:staff.transportFuel
      });
      const priced=result.route.ok&&result.fuelLookup==='CURRENT_NOTIFIED_RATE'&&
        !!result.draft.fuelRateSnapshot&&
        result.draft.quote.lines.some(l=>l.label==='Pet transport'&&l.totalPkr>0)&&
        selected.customerConfirmed&&selected.kennelConfirmed&&selected.accessConfirmed&&
        (!selected.dropoffPin||selected.dropoffConfirmed);
      if(selected.action==='save'){
        if(!priced||!result.route.ok||!result.draft.fuelRateSnapshot)
          return json({error:'Verified route and current petrol rate required before saving'},409);
        const snapshot=makeReviewSnapshot({
          ...review,draft:result.draft,
          transport:{route:result.route.estimate,fuelRate:result.draft.fuelRateSnapshot}
        });
        snapshot.transportService=selected.visit;
        snapshot.transportLocationSource=source.transportLocation?'customer_record':'staff_confirmed';
        await (staff.saveReview??saveReviewDraft)(
          env.DATABASE_URL,snapshot,selected.revision,email
        );
        return new Response(null,{status:303,headers:{
          Location:'/staff/draft/saved?id='+encodeURIComponent(selected.bookingId),
          'Cache-Control':'private, no-store'
        }});
      }
      return html(renderStaffTransportResult(source,selected,result));
    }catch(error){
      if(error instanceof DraftSaveError)return json({error:error.message},error.status);
      return json({error:'Unable to prepare transport estimate'},500);
    }
  }
  if(path==='/staff/draft/save'||path==='/staff/draft/saved'||path==='/staff/draft/saved.pdf'){
    const writing=path==='/staff/draft/save';
    if(request.method!==(writing?'POST':'GET'))
      return json({error:'Method not allowed'},405,{Allow:writing?'POST':'GET'});
    if(env.APEX_STAFF_DRAFTS_ENABLED!=='true')
      return json({error:'Saved drafts are not enabled'},503);
    if(!env.STAFF_ACCESS_AUD||!env.STAFF_ALLOWED_EMAILS||!env.DATABASE_URL)
      return json({error:'Staff access not configured'},503);
    const email=await authorizedStaff(env,staff.context,request);
    if(!email)return json({error:'Forbidden'},403);
    if(writing){
      // Browser navigation has a mandatory Origin header on POST; fail closed
      // instead of trusting cookies alone on a potentially cross-site form.
      if(request.headers.get('origin')!==new URL(request.url).origin||
         request.headers.get('sec-fetch-site')==='cross-site')
        return json({error:'Forbidden'},403);
      if(!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers.get('content-type')??''))
        return json({error:'Expected browser form'},415);
      try{
        const form=await boundedForm(request);
        const allowed=['id','package','revision'];
        if([...form.keys()].some(k=>!allowed.includes(k))||
           allowed.some(k=>form.getAll(k).length!==1))
          throw new DraftSaveError('Invalid form fields',400);
        const id=form.get('id')??'';
        const packageChoice=form.get('package')??'';
        const revisionRaw=form.get('revision')??'';
        if(!/^(0|[1-9][0-9]{0,6})$/.test(revisionRaw)||
           !['daily','monthly'].includes(packageChoice))
          throw new DraftSaveError('Invalid draft revision or package',400);
        let parsed:ReturnType<typeof parseStaffDraftRequest>;
        try{parsed=parseStaffDraftRequest(new URL('/staff/draft?id='+
          encodeURIComponent(id)+'&package='+encodeURIComponent(packageChoice),request.url));}
        catch{throw new DraftSaveError('Invalid booking or package',400);}
        const source=await (staff.draft??readStaffInvoiceSource)(env.DATABASE_URL,parsed.bookingId);
        if(!source)return json({error:'Booking not found'},404);
        const snapshot=makeReviewSnapshot(prepareStaffDraftReview(source,parsed.packageChoice));
        await (staff.saveReview??saveReviewDraft)(env.DATABASE_URL,snapshot,Number(revisionRaw),email);
        return new Response(null,{status:303,headers:{
          Location:'/staff/draft/saved?id='+encodeURIComponent(id),
          'Cache-Control':'private, no-store'
        }});
      }catch(error){
        if(error instanceof DraftSaveError)return json({error:error.message},error.status);
        return json({error:'Unable to save estimate'},500);
      }
    }
    try{
      const url=new URL(request.url);
      const id=url.searchParams.get('id')??'';
      const isPdf=path==='/staff/draft/saved.pdf';
      const download=isPdf&&url.searchParams.get('download')==='1';
      if([...url.searchParams.keys()].some(k=>k!=='id'&&!(isPdf&&k==='download'))||
         url.searchParams.getAll('id').length!==1||
         url.searchParams.getAll('download').length>(isPdf?1:0)||
         (url.searchParams.has('download')&&!download))
        return json({error:'Invalid saved draft request'},400);
      let parsed:ReturnType<typeof parseStaffDraftRequest>;
      try{parsed=parseStaffDraftRequest(new URL('/staff/draft?id='+encodeURIComponent(id),request.url));}
      catch{return json({error:'Invalid booking ID'},400);}
      const saved=await (staff.loadReview??loadSavedReview)(env.DATABASE_URL,parsed.bookingId);
      if(!saved)return json({error:'Saved draft not found'},404);
      if(path==='/staff/draft/saved'){
        return new Response(null,{status:302,headers:{
          Location:'/staff/draft/saved.pdf?id='+encodeURIComponent(parsed.bookingId),
          'Cache-Control':'private, no-store'
        }});
      }
      return await canvaInvoiceResponse(env,request,saved.snapshot,
        saved.updatedAt.slice(0,10),download);
    }catch(error){
      if(error instanceof DraftSaveError)return json({error:error.message},error.status);
      return json({error:'Unable to load saved estimate'},500);
    }
  }
  if (path === '/staff/draft') {
    if (request.method !== 'GET') return json({error:'Method not allowed'},405,{Allow:'GET'});
    // Identical Access controls as /staff and /staff/api/bookings; no secret fallbacks.
    if(!env.STAFF_ACCESS_AUD || !env.STAFF_ALLOWED_EMAILS || !env.DATABASE_URL){
      return json({error:'Staff access not configured'},503);
    }
    const email=await authorizedStaff(env,staff.context,request);
    if(!email)return json({error:'Forbidden'},403);
    let parsed:ReturnType<typeof parseStaffDraftRequest>;
    const url=new URL(request.url);
    const format=url.searchParams.getAll('format');
    if(format.length>1||(format.length===1&&format[0]!=='print'))
      return json({error:'Invalid invoice preview format'},400);
    try{parsed=parseStaffDraftRequest(url);}
    catch{return json({error:'Invalid invoice draft request'},400);}
    try{
      const source=await (staff.draft??readStaffInvoiceSource)(env.DATABASE_URL,parsed.bookingId);
      if(!source)return json({error:'Booking not found'},404);
      const review=prepareStaffDraftReview(source,parsed.packageChoice);
      if(format[0]==='print'){
        if(!review.draft||source.transportRequested!==false)
          return json({error:'Complete boarding estimate required for printing'},409);
        const snapshot=makeReviewSnapshot(review);
        return await canvaInvoiceResponse(env,request,snapshot,
          new Date().toISOString().slice(0,10));
      }
      if(env.APEX_STAFF_DRAFTS_ENABLED==='true'){
        const saved=await (staff.loadReview??loadSavedReview)(env.DATABASE_URL,parsed.bookingId);
        return html(renderStaffDraftReview(review,'staff',{
          enableSaving:true,savedRevision:saved?.revision??0
        }));
      }
      return html(renderStaffDraftReview(review));
    }catch(error){
      if(error instanceof DraftSaveError)return json({error:error.message},error.status);
      return json({error:'Internal server error'},500);
    }
  }
  if (path === '/staff' || path === '/staff/api/bookings') {
    if (request.method !== 'GET') return json({error:'Method not allowed'},405,{Allow:'GET'});
    // Fail closed: these endpoints never fall back to an intake token or unverified headers.
    if (!env.STAFF_ACCESS_AUD || !env.STAFF_ALLOWED_EMAILS || !env.DATABASE_URL) {
      return json({error:'Staff access not configured'},503);
    }
    const email=await authorizedStaff(env,staff.context,request);
    if (!email) return json({error:'Forbidden'},403);
    let filter:StaffFilter;
    try { filter=parseStaffFilter(new URL(request.url)); }
    catch { return json({error:'Invalid filter'},400); }
    try {
      const rows=await (staff.list??listStaffBookings)(env.DATABASE_URL,filter);
      return path==='/staff' ? html(renderStaffConsoleHtml(rows,{demo:false,filter,email}))
        : json({items:rows,limit:50,readOnly:true});
    } catch { return json({error:'Internal server error'},500); }
  }
  if (path !== '/api/ingest') return json({error:'Not found'}, 404);

  if (request.method !== 'POST') return json({error:'Method not allowed'}, 405, {Allow:'POST'});
  if (!env.DATABASE_URL || !env.INTAKE_API_SECRET || env.INTAKE_API_SECRET.length < 32) {
    return json({error:'Service not configured'}, 503);
  }
  if (!bearerAuthorized(request.headers.get('authorization'), env.INTAKE_API_SECRET)) {
    return json({error:'Unauthorized'}, 401);
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return json({error:'JSON required'}, 415);
  }

  try {
    const input = parseIntake(await limitedJson(request));
    const saved = await persist(env.DATABASE_URL, input,ownerIntent(env));
    await notifyOwnerOfNewBooking(env,input,saved,staff);
    return json(saved, saved.created ? 201 : 200);
  } catch (error) {
    if (error instanceof IntakeError) return json({error:error.message}, error.status);
    if (error instanceof SyntaxError || error instanceof TypeError) {
      return json({error:'Invalid JSON'}, 400);
    }
    // No PII, Postgres errors, credential values or raw user input in public responses.
    return json({error:'Internal server error'}, 500);
  }
}

export default {
  scheduled(_event:unknown,env:WorkerEnv,context:{waitUntil(task:Promise<unknown>):void}):void {
    if(!env.DATABASE_URL||!ownerIntent(env))return;
    context.waitUntil(sweepOwnerAlerts(env.DATABASE_URL,ownerAlertConfig(env)).catch(()=>{console.warn('Owner alert sweep unavailable');}));
  },
  fetch(request: Request, env: WorkerEnv, context?: StaffContext): Promise<Response> {
    return handleWorkerRequest(request, env, persistBookingWithNeon, {context});
  },
};
