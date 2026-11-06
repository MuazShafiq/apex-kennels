import { timingSafeEqual } from 'node:crypto';
import {isTransportServiceLocation} from './transport-service-area.ts';
import { IntakeError, parseIntake, type IntakeRequest } from './intake.ts';
import {parsePublicBookingEnvelope,verifyBookingChallenge} from './public-booking.ts';
import {parsePlaceQuery,searchPakistaniPlaces,type PlaceSuggestion} from './location-suggestions.ts';
import {suggestTomTomPlaces,resolveTomTomPlace,TomTomPlacesError,type TomTomSuggestion} from './tomtom-places.ts';
import { persistBookingWithNeon } from './neon-worker-db.ts';
import type { SavedBooking } from './booking-store.ts';
import {listStaffBookings,parseStaffFilter,syntheticBookings, type StaffBooking, type StaffFilter} from './staff-bookings.ts';
import {renderStaffConsoleHtml} from './staff-console.ts';
import {syntheticInvoiceHtml} from './demo-invoice.ts';
import {readStaffInvoiceSource,parseStaffDraftRequest,prepareStaffDraftReview,renderStaffDraftReview,type StaffInvoiceSource} from './staff-invoice-draft.ts';
import {resolveSharedGoogleMapsPin,type SharedPinResolution} from './shared-map-pin.ts';
import {readPinForm,renderStaffPinChecker} from './staff-location.ts';
import {readStaffBookingDetail,renderStaffBookingDetail,parseStaffBookingId,type StaffBookingDetail} from './staff-booking-detail.ts';

export type WorkerEnv = {
  DATABASE_URL?: string;
  INTAKE_API_SECRET?: string;
  STAFF_ACCESS_AUD?: string;
  STAFF_ALLOWED_EMAILS?: string;
  APEX_PUBLIC_BOOKING_ENABLED?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  GEOAPIFY_API_KEY?: string;
  TOMTOM_API_KEY?: string;
  ASSETS?: {fetch(request:Request):Promise<Response>};
};

export type SaveIntake = (databaseUrl: string, input: IntakeRequest) => Promise<SavedBooking>;
export type StaffList = (databaseUrl: string, filter: StaffFilter) => Promise<StaffBooking[]>;
export type StaffContext = {access?: {aud: string; getIdentity(): Promise<{email?:string}|null>}};
export type StaffDraftReader=(databaseUrl:string,bookingId:string)=>Promise<StaffInvoiceSource|null>;
export type StaffDetailReader=(databaseUrl:string,bookingId:string)=>Promise<StaffBookingDetail|null>;
export type StaffOptions = {context?: StaffContext; list?: StaffList; draft?:StaffDraftReader; detail?:StaffDetailReader; resolvePin?:(url:string)=>Promise<SharedPinResolution>; verifyChallenge?:(token:string,secret:string,hostname:string)=>Promise<boolean>; searchPlaces?:(query:string,key:string)=>Promise<PlaceSuggestion[]>; suggestPlaces?:(query:string,key:string)=>Promise<TomTomSuggestion[]>; resolvePlace?:(type:TomTomSuggestion['placeType'],id:string,key:string)=>Promise<PlaceSuggestion>};

async function authorizedStaff(env: WorkerEnv, context?: StaffContext): Promise<string|null> {
  if (!env.STAFF_ACCESS_AUD || !env.STAFF_ALLOWED_EMAILS || context?.access?.aud!==env.STAFF_ACCESS_AUD) return null;
  const allow = env.STAFF_ALLOWED_EMAILS.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if (!allow.length) return null;
  try {
    const email=(await context.access.getIdentity())?.email?.trim().toLowerCase();
    return email && allow.includes(email) ? email : null;
  } catch { return null; }
}

function html(body: string):Response {
  return new Response(body, {status:200,headers:{
    'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
    'X-Robots-Tag':'noindex, nofollow',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
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
        "style-src 'self' 'unsafe-inline'; connect-src 'self'; "+
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
    }catch{return json({error:'Paste a Google Maps location link',code:'INVALID_LINK'},400);}
    const resolved=await (staff.resolvePin??resolveSharedGoogleMapsPin)(raw);
    if(!resolved.ok){
      if(resolved.reason==='REDIRECT_UNAVAILABLE')
        return json({error:'Could not open that Maps link. Try copying the exact pin again.',code:'LINK_UNAVAILABLE'},422);
      return json({error:'Share a specific pin or place from Google Maps, not a search or directions link.',code:'NOT_EXACT_PIN'},422);
    }
    if(!isTransportServiceLocation(resolved.pin.lat,resolved.pin.lon))
      return json({error:'Pickup and drop-off are available only within Islamabad and Rawalpindi',code:'OUT_OF_SERVICE_AREA'},422);
    return json({latitude:resolved.pin.lat,longitude:resolved.pin.lon,
      mapsUrl:'https://www.google.com/maps/search/?api=1&query='+
        encodeURIComponent(resolved.pin.lat+','+resolved.pin.lon)});
  }
  if(path==='/api/book/places'){
    if(request.method!=='GET')return json({error:'Method not allowed'},405,{Allow:'GET'});
    if(!env.TOMTOM_API_KEY&&!env.GEOAPIFY_API_KEY)return json({error:'Location search unavailable'},503);
    let query:string;
    try{query=parsePlaceQuery(new URL(request.url));}
    catch{return json({error:'Enter at least three characters',code:'BAD_QUERY'},400);}
    try{
      const usingTomTom=!!env.TOMTOM_API_KEY;
      const providerItems=usingTomTom
        ?await (staff.suggestPlaces??suggestTomTomPlaces)(query,env.TOMTOM_API_KEY!)
        :await (staff.searchPlaces??searchPakistaniPlaces)(query,env.GEOAPIFY_API_KEY!);
      const items=usingTomTom?providerItems:(providerItems as PlaceSuggestion[])
        .filter(p=>isTransportServiceLocation(p.latitude,p.longitude));
      return json({items,attribution:usingTomTom?'TomTom':'Geoapify · OpenStreetMap contributors'});
    }catch(error){
      if(error instanceof TomTomPlacesError){
        // Do not log location queries, response bodies or credentials.
        console.warn('Apex place search provider status',error.status);
        if(error.status===429)
          return json({error:'Search is busy. Please try again shortly.',code:'RATE_LIMITED'},429,{'Retry-After':'2'});
        if(error.status===403)
          return json({error:'Place search service is not authorized',code:'PROVIDER_ACCESS'},502);
        if(error.status===400)
          return json({error:'Place search provider rejected the request',code:'PROVIDER_REJECTED'},502);
        return json({error:'Place search provider unavailable',code:'PROVIDER_ERROR'},502);
      }
      console.warn('Apex place search request failed');
      return json({error:'Place search could not connect',code:'NETWORK_ERROR'},502);
    }
  }
  if(path==='/api/book/place'){
    if(request.method!=='GET')return json({error:'Method not allowed'},405,{Allow:'GET'});
    if(!env.TOMTOM_API_KEY)return json({error:'Place lookup unavailable'},503);
    const url=new URL(request.url);
    if([...url.searchParams.keys()].some(k=>k!=='type'&&k!=='id')||
       url.searchParams.getAll('type').length!==1||url.searchParams.getAll('id').length!==1)
      return json({error:'Invalid place selection'},400);
    const type=url.searchParams.get('type')??'';
    const id=url.searchParams.get('id')??'';
    if(!['pois','addresses','streets','intersections','areas'].includes(type)||
       !/^[A-Za-z0-9_-]{1,160}$/.test(id))
      return json({error:'Invalid place selection'},400);
    try{
      const place=await (staff.resolvePlace??resolveTomTomPlace)(
        type as TomTomSuggestion['placeType'],id,env.TOMTOM_API_KEY);
      if(!isTransportServiceLocation(place.latitude,place.longitude))
        return json({error:'Pickup and drop-off are available only in Islamabad and Rawalpindi',
          code:'OUT_OF_SERVICE_AREA'},422);
      return json({place});
    }catch(error){
      if(error instanceof TomTomPlacesError&&error.status===429)
        return json({error:'Search is busy. Please try again shortly.',code:'RATE_LIMITED'},429,{'Retry-After':'2'});
      if(error instanceof TomTomPlacesError&&error.status===422)
        return json({error:'Pickup and drop-off are available only in Islamabad and Rawalpindi',
          code:'OUT_OF_SERVICE_AREA'},422);
      return json({error:'Could not locate that place. Try another suggestion or move the map pin.',code:'PLACE_UNAVAILABLE'},502);
    }
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
      const saved=await persist(env.DATABASE_URL,parsed.booking);
      return json({ok:true,reference:saved.bookingId.slice(0,8)},saved.created?201:200);
    }catch(error){
      if(error instanceof IntakeError)return json({error:'Booking details changed. Please contact Apex.'},409);
      return json({error:'Unable to save the request. Please contact Apex.'},500);
    }
  }
  if (path === '/demo/invoice') {
    if (request.method !== 'GET') return json({error:'Method not allowed'},405,{Allow:'GET'});
    return html(syntheticInvoiceHtml());
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
    const email=await authorizedStaff(env,staff.context);
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
    const email=await authorizedStaff(env,staff.context);
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
  if (path === '/staff/draft') {
    if (request.method !== 'GET') return json({error:'Method not allowed'},405,{Allow:'GET'});
    // Identical Access controls as /staff and /staff/api/bookings; no secret fallbacks.
    if(!env.STAFF_ACCESS_AUD || !env.STAFF_ALLOWED_EMAILS || !env.DATABASE_URL){
      return json({error:'Staff access not configured'},503);
    }
    const email=await authorizedStaff(env,staff.context);
    if(!email)return json({error:'Forbidden'},403);
    let parsed:ReturnType<typeof parseStaffDraftRequest>;
    try{parsed=parseStaffDraftRequest(new URL(request.url));}
    catch{return json({error:'Invalid invoice draft request'},400);}
    try{
      const source=await (staff.draft??readStaffInvoiceSource)(env.DATABASE_URL,parsed.bookingId);
      if(!source)return json({error:'Booking not found'},404);
      const review=prepareStaffDraftReview(source,parsed.packageChoice);
      return html(renderStaffDraftReview(review));
    }catch{return json({error:'Internal server error'},500);}
  }
  if (path === '/staff' || path === '/staff/api/bookings') {
    if (request.method !== 'GET') return json({error:'Method not allowed'},405,{Allow:'GET'});
    // Fail closed: these endpoints never fall back to an intake token or unverified headers.
    if (!env.STAFF_ACCESS_AUD || !env.STAFF_ALLOWED_EMAILS || !env.DATABASE_URL) {
      return json({error:'Staff access not configured'},503);
    }
    const email=await authorizedStaff(env,staff.context);
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
    const saved = await persist(env.DATABASE_URL, input);
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
  fetch(request: Request, env: WorkerEnv, context?: StaffContext): Promise<Response> {
    return handleWorkerRequest(request, env, persistBookingWithNeon, {context});
  },
};
