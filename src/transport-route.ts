/**
 * Route planning ONLY from operator-verified coordinates.
 * Never geocode an unstructured text address into a billable distance.
 * Provider: Geoapify Routing API (OSM-based).
 * Route review is still needed for gated societies, driveways and return legs.
 */
export type GeoPin={lat:number;lon:number};
export type TransportVisit='pickup'|'dropoff'|'pickup_and_dropoff';
export type RouteRequest={
  kennelPin?:GeoPin;
  customerPin?:GeoPin;
  kennelPinConfirmed:boolean;
  customerPinConfirmed:boolean;
  visit?:TransportVisit;
};
export type RouteEstimate={
  status:'ROUTE_REVIEW_REQUIRED';
  provider:'Geoapify Routing';
  routeType:'kennel_customer_kennel';
  loopDistanceKm:number;
  plannedRoundTrips:1|2;
  totalDrivenKm:number;
  retrievedAt:string;
  kennelPin:GeoPin;
  customerPin:GeoPin;
  needsStaffConfirmation:true;
};
export type RouteResult=
  | {ok:true;estimate:RouteEstimate}
  | {ok:false;reason:'PINS_NOT_VERIFIED'|'ROUTE_NOT_AVAILABLE'|'INVALID_VISITS';detail:string};

type Fetcher=typeof fetch;
function validPakistanCoordinate(p:GeoPin|undefined):p is GeoPin{
  return !!p && Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&
    p.lat>=23&&p.lat<=38&&p.lon>=60&&p.lon<=78;
}
function visits(v?:TransportVisit):1|2|null{
  if(v==='pickup'||v==='dropoff')return 1;
  if(v==='pickup_and_dropoff')return 2;
  return null;
}

/** Explicit numeric pins only. Never treat a Google Maps viewport centre as the destination. */
export function parseExplicitCoordinatePin(text:string):GeoPin|null{
  const value=text.trim();
  let match=value.match(/^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if(!match){
    try {
      const url=new URL(value);
      const host=url.hostname.toLowerCase();
      if(!['www.google.com','google.com','maps.google.com','www.google.com.pk','google.com.pk'].includes(host) ||
         url.protocol!=='https:')return null;
      const q=url.searchParams.get('q')??url.searchParams.get('query');
      if(!q)return null;
      match=q.trim().match(/^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/);
    }catch {return null;}
  }
  if(!match)return null;
  const p={lat:Number(match[1]),lon:Number(match[2])};
  return validPakistanCoordinate(p)?p:null;
}

export async function routeApexTransport(
  input:RouteRequest,
  options:{apiKey?:string;fetcher?:Fetcher;now?:Date}={}
):Promise<RouteResult>{
  const tripCount=visits(input.visit);
  if(!tripCount)return {
    ok:false,reason:'INVALID_VISITS',
    detail:'Staff must choose pickup, drop-off, or both; Google Form yes/no alone is ambiguous'
  };
  if(!input.kennelPinConfirmed||!input.customerPinConfirmed ||
     !validPakistanCoordinate(input.kennelPin)||!validPakistanCoordinate(input.customerPin)){
    return {ok:false,reason:'PINS_NOT_VERIFIED',
      detail:'Get the exact kennel entrance pin and a customer-approved pickup/drop-off pin before routing'};
  }
  const a=input.kennelPin,b=input.customerPin;
  if(Math.abs(a.lat-b.lat)<1e-7&&Math.abs(a.lon-b.lon)<1e-7){
    return {ok:false,reason:'PINS_NOT_VERIFIED',
      detail:'Customer pin and kennel pin cannot be identical'};
  }
  const key=options.apiKey;
  if(!key || key.length<12)return {
    ok:false,reason:'ROUTE_NOT_AVAILABLE',
    detail:'Server-side Geoapify API key is not configured; no route distance estimated'
  };
  const url=new URL('https://api.geoapify.com/v1/routing');
  url.searchParams.set('waypoints',
    a.lat+','+a.lon+'|'+b.lat+','+b.lon+'|'+a.lat+','+a.lon);
  url.searchParams.set('mode','drive');
  url.searchParams.set('apiKey',key);
  try {
    const response=await (options.fetcher??fetch)(url.toString(),{
      method:'GET',redirect:'error',cache:'no-store',
      signal:AbortSignal.timeout(5000),
      headers:{Accept:'application/json'},
    });
    if(!response.ok)throw new Error('Route service error');
    const body=await response.text();
    if(body.length>128000)throw new Error('Oversized route');
    const json=JSON.parse(body);
    const features=json?.features;
    if(!Array.isArray(features)||features.length<1)throw new Error('No drivable route');
    const meters=features[0]?.properties?.distance;
    if(typeof meters!=='number'||!Number.isFinite(meters)||meters<=0||meters>500000){
      throw new Error('Invalid round-trip road distance');
    }
    const loopDistanceKm=Math.round(meters)/1000;
    const totalDrivenKm=Math.round(meters*tripCount)/1000;
    return {ok:true,estimate:{
      status:'ROUTE_REVIEW_REQUIRED',
      provider:'Geoapify Routing',
      routeType:'kennel_customer_kennel',
      kennelPin:{...a},customerPin:{...b},
      loopDistanceKm,plannedRoundTrips:tripCount,totalDrivenKm,
      retrievedAt:(options.now??new Date()).toISOString(),
      needsStaffConfirmation:true,
    }};
  }catch{
    return {ok:false,reason:'ROUTE_NOT_AVAILABLE',
      detail:'No reliable drive route; review both pins and enter verified total vehicle distance manually'};
  }
}
