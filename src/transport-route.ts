import {isTransportServiceLocation} from './transport-service-area.ts';

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
  /** Optional distinct return destination for pickup AND drop-off. */
  dropoffPin?:GeoPin;
  dropoffPinConfirmed?:boolean;
  kennelPinConfirmed:boolean;
  customerPinConfirmed:boolean;
  /** Mandatory road-access point on all kennel-bound and outward drives. */
  kennelAccessWaypoint?:GeoPin;
  kennelAccessWaypointConfirmed?:boolean;
  visit?:TransportVisit;
};
export type RouteEstimate={
  status:'ROUTE_REVIEW_REQUIRED';
  provider:'Geoapify Routing';
  routeType:'kennel_access_customer_access_kennel';
  loopDistanceKm:number;
  plannedRoundTrips:1|2;
  totalDrivenKm:number;
  retrievedAt:string;
  kennelPin:GeoPin;
  customerPin:GeoPin;
  /** Present only when the drop-off gate differs from pickup. */
  dropoffPin?:GeoPin;
  dropoffLoopDistanceKm?:number;
  kennelAccessWaypoint:GeoPin;
  needsStaffConfirmation:true;
};
export type RouteResult=
  | {ok:true;estimate:RouteEstimate}
  | {ok:false;reason:'PINS_NOT_VERIFIED'|'OUT_OF_SERVICE_AREA'|'ACCESS_WAYPOINT_NOT_VERIFIED'|'ROUTE_NOT_AVAILABLE'|'INVALID_VISITS';detail:string};

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
  // The legacy Form may contain unverified out-of-area transport requests.
  // Never turn one into a priced route, even if staff can inspect its pin.
  if(input.dropoffPin!==undefined && (tripCount!==2 || !input.dropoffPinConfirmed ||
      !validPakistanCoordinate(input.dropoffPin))){
    return {ok:false,reason:'PINS_NOT_VERIFIED',
      detail:'A separate drop-off gate must be verified before pricing'};
  }
  if(!isTransportServiceLocation(input.customerPin.lat,input.customerPin.lon) ||
     input.dropoffPin && !isTransportServiceLocation(input.dropoffPin.lat,input.dropoffPin.lon)){
    return {ok:false,reason:'OUT_OF_SERVICE_AREA',
      detail:'Pickup and drop-off are available only within Islamabad and Rawalpindi'};
  }
  if(!input.kennelAccessWaypointConfirmed || !validPakistanCoordinate(input.kennelAccessWaypoint)) {
    return {ok:false,reason:'ACCESS_WAYPOINT_NOT_VERIFIED',
      detail:'The kennel access restaurant waypoint must be resolved to confirmed coordinates; the short Maps link alone is not sufficient'};
  }
  const a=input.kennelPin,b=input.customerPin,w=input.kennelAccessWaypoint;
  if(Math.abs(a.lat-b.lat)<1e-7&&Math.abs(a.lon-b.lon)<1e-7){
    return {ok:false,reason:'PINS_NOT_VERIFIED',
      detail:'Customer pin and kennel pin cannot be identical'};
  }
  const key=options.apiKey;
  if(!key || key.length<12)return {
    ok:false,reason:'ROUTE_NOT_AVAILABLE',
    detail:'Server-side Geoapify API key is not configured; no route distance estimated'
  };
  // Each service is one complete drivable loop, with the mandatory road
  // approach both outbound and inbound. When gates differ, query Geoapify
  // independently: doubling the pickup journey would silently over/undercharge.
  const dropoff=input.dropoffPin??b;
  const sameGate=Math.abs(b.lat-dropoff.lat)<1e-7&&Math.abs(b.lon-dropoff.lon)<1e-7;
  async function fetchLoop(destination:GeoPin):Promise<number>{
    const url=new URL('https://api.geoapify.com/v1/routing');
    url.searchParams.set('waypoints',[a,w,destination,w,a]
      .map(p=>p.lat+','+p.lon).join('|'));
    url.searchParams.set('mode','drive');
    url.searchParams.set('apiKey',key!);
    const response=await (options.fetcher??fetch)(url.toString(),{
      method:'GET',redirect:'manual',cache:'no-store',
      signal:AbortSignal.timeout(5000),headers:{Accept:'application/json'}
    });
    if(!response.ok)throw new Error('Route service error');
    const body=await response.text();
    if(body.length>128000)throw new Error('Oversized route');
    const json=JSON.parse(body);
    const features=json?.features;
    if(!Array.isArray(features)||features.length<1)throw new Error('No drivable route');
    const meters=features[0]?.properties?.distance;
    if(typeof meters!=='number'||!Number.isFinite(meters)||meters<=0||meters>500000)
      throw new Error('Invalid round-trip road distance');
    return meters;
  }
  try{
    const first=await fetchLoop(b);
    const second=tripCount===2?(sameGate?first:await fetchLoop(dropoff)):0;
    const totalDrivenKm=Math.round(first+second)/1000;
    return {ok:true,estimate:{
      status:'ROUTE_REVIEW_REQUIRED',provider:'Geoapify Routing',
      routeType:'kennel_access_customer_access_kennel',
      kennelPin:{...a},customerPin:{...b},kennelAccessWaypoint:{...w},
      ...(!sameGate?{dropoffPin:{...dropoff},dropoffLoopDistanceKm:Math.round(second)/1000}:{}),
      loopDistanceKm:Math.round(first)/1000,
      plannedRoundTrips:tripCount,totalDrivenKm,
      retrievedAt:(options.now??new Date()).toISOString(),
      needsStaffConfirmation:true
    }};
  }catch{
    return {ok:false,reason:'ROUTE_NOT_AVAILABLE',
      detail:'No reliable drive route for all requested locations; check each gate and its drivable access'};
  }
}
