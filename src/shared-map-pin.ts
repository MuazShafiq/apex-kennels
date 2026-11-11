import {parseExplicitCoordinatePin,type GeoPin} from './transport-route.ts';

/**
 * Accepts static, customer-shared Google Maps pins. NEVER uses an unstructured
 * street address or the @map-viewport coordinates as a billable destination.
 *
 * Network redirects are followed manually and ONLY between explicitly
 * allowlisted Google Maps domains. No arbitrary redirect URLs or private IPs.
 */
const HOSTS=new Set([
  'www.google.com','google.com','maps.google.com',
  'www.google.com.pk','google.com.pk','maps.app.goo.gl'
]);
const SHORT_HOST='maps.app.goo.gl';

export type SharedPinResolution=
  | {ok:true;pin:GeoPin;verifiedBy:'explicit_coordinates'|'google_maps_place';
      customerConfirmationRequired:true;roadEntranceConfirmed:false}
  | {ok:false;reason:'NOT_EXACT_PIN'|'UNSUPPORTED_LINK'|'REDIRECT_UNAVAILABLE'};

function allowedGoogleMaps(url:URL):boolean{
  return url.protocol==='https:'&&HOSTS.has(url.hostname.toLowerCase())&&
    (url.port===''||url.port==='443')&&!url.username&&!url.password;
}
function pakistanPin(lat:number,lon:number):GeoPin|null{
  return Number.isFinite(lat)&&Number.isFinite(lon)&&
    lat>=23&&lat<=38&&lon>=60&&lon<=78 ? {lat,lon} : null;
}

/** Google place data coordinates identify the place pin, unlike a /@ viewport. */
export function parseGooglePlacePin(urlString:string):GeoPin|null{
  try {
    const url=new URL(urlString);
    if(!allowedGoogleMaps(url)||url.hostname.toLowerCase()===SHORT_HOST)return null;
    const pathname=decodeURIComponent(url.pathname);
    // A directions link can contain multiple place data points; do not guess
    // which represents the customer's pickup gate.
    if(pathname.startsWith('/maps/dir/'))return null;
    // Full Google URLs place the exact marker either in /data=... or
    // ?data=...; neither is interchangeable with the @viewport centre.
    const exact=/!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)(?:!|\/|$)/;
    const marker=pathname.match(exact)??url.searchParams.get('data')?.match(exact);
    if(marker)return pakistanPin(Number(marker[1]),Number(marker[2]));
    // A dropped pin can also be encoded as /maps/place/lat,lon.
    const coordinatePlace=pathname.match(/^\/maps\/place\/(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)(?:\/|$)/);
    if(coordinatePlace)
      return pakistanPin(Number(coordinatePlace[1]),Number(coordinatePlace[2]));
    return null;
  }catch{return null;}
}

function fromExactUrl(value:string):{pin:GeoPin;type:'explicit_coordinates'|'google_maps_place'}|null{
  const explicit=parseExplicitCoordinatePin(value);
  if(explicit)return {pin:explicit,type:'explicit_coordinates'};
  const google=parseGooglePlacePin(value);
  if(google)return {pin:google,type:'google_maps_place'};
  return null;
}

/**
 * This is a location-preparation helper, NOT proof that a vehicle can reach
 * that pin. Staff must confirm the actual collection gate with the customer.
 * No persistence, geocoding, route calculation or payment action here.
 */
export async function resolveSharedGoogleMapsPin(
  raw:string,
  options:{fetcher?:typeof fetch;maxRedirects?:number}={}
):Promise<SharedPinResolution>{
  if(typeof raw!=='string'||raw.length>2048||raw.length<3||
     /[\u0000-\u001f\u007f]/.test(raw)) {
    return {ok:false,reason:'UNSUPPORTED_LINK'};
  }
  const immediate=fromExactUrl(raw.trim());
  if(immediate)return {
    ok:true,pin:immediate.pin,verifiedBy:immediate.type,
    customerConfirmationRequired:true,roadEntranceConfirmed:false
  };
  let url:URL;
  try{url=new URL(raw.trim());}
  catch{return {ok:false,reason:'NOT_EXACT_PIN'};}
  if(!allowedGoogleMaps(url))return {ok:false,reason:'UNSUPPORTED_LINK'};
  const limit=Math.min(Math.max(Math.floor(options.maxRedirects??4),0),6);
  const fetcher=options.fetcher??fetch;
  let current=url;
  // Only short Google Maps links may trigger HTTP. Standard Maps links without
  // an exact marker are rejected; no scraping of the map page/body occurs.
  if(current.hostname.toLowerCase()!==SHORT_HOST)return {
    ok:false,reason:'NOT_EXACT_PIN'
  };
  for(let i=0;i<limit;i++){
    let response:Response;
    try{
      response=await fetcher(current.toString(),{
        method:'GET',redirect:'manual',cache:'no-store',
        headers:{Accept:'text/html'},
        signal:AbortSignal.timeout(4500)
      });
    }catch{return {ok:false,reason:'REDIRECT_UNAVAILABLE'};}
    if(![301,302,303,307,308].includes(response.status))return {
      ok:false,reason:'NOT_EXACT_PIN'
    };
    const location=response.headers.get('location');
    if(!location)return {ok:false,reason:'REDIRECT_UNAVAILABLE'};
    let next:URL;
    try{next=new URL(location,current);}
    catch{return {ok:false,reason:'REDIRECT_UNAVAILABLE'};}
    // Reject redirect to localhost, private IPs, data:, attacker domains, etc.
    if(!allowedGoogleMaps(next))return {ok:false,reason:'UNSUPPORTED_LINK'};
    const found=fromExactUrl(next.toString());
    if(found)return {
      ok:true,pin:found.pin,verifiedBy:found.type,
      customerConfirmationRequired:true,roadEntranceConfirmed:false
    };
    current=next;
  }
  return {ok:false,reason:'REDIRECT_UNAVAILABLE'};
}
