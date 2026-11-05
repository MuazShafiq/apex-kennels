import {APEX_KENNEL_LOCATION,APEX_KENNEL_ACCESS} from './apex-location-config.ts';
import type {GeoPin} from './transport-route.ts';

/** Live road check only. No pricing or staff approval is granted by these results. */
export type AccessDirection='bawli_to_kennel'|'kennel_to_bawli';
export type AccessLeg={
  direction:AccessDirection;
  metres:number;
  seconds:number;
  snappedStartMetres:number;
  snappedEndMetres:number;
  /** Coordinates are [longitude,latitude], not Google Maps lat/lon. */
  geometry:{type:'MultiLineString';coordinates:number[][][]};
};
export type AccessRouteCheck={
  status:'MAP_ROUTE_REQUIRES_HUMAN_VALIDATION';
  checkedAt:string;
  provider:'Geoapify Routing';
  accessPin:GeoPin;
  kennelPin:GeoPin;
  legs:AccessLeg[];
  roundTripMetres:number;
  warnings:string[];
  notForBilling:true;
};

function distanceBetweenMetres(a:GeoPin,b:GeoPin):number{
  const rad=Math.PI/180;
  const dLat=(b.lat-a.lat)*rad,dLon=(b.lon-a.lon)*rad;
  const h=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
  return 6371000*2*Math.asin(Math.min(1,Math.sqrt(h)));
}
function geometryEndpoint(lonLat:number[]):GeoPin{
  if(!Array.isArray(lonLat)||lonLat.length<2||
    !Number.isFinite(lonLat[0])||!Number.isFinite(lonLat[1])||
    lonLat[0]<60||lonLat[0]>78||lonLat[1]<23||lonLat[1]>38){
    throw new Error('Provider returned an invalid Pakistan road coordinate');
  }
  return {lat:lonLat[1],lon:lonLat[0]};
}
function extractLeg(raw:unknown,dir:AccessDirection,from:GeoPin,to:GeoPin):AccessLeg{
  if(!raw||typeof raw!=='object')throw new Error('Missing route data');
  const response=raw as Record<string,unknown>;
  const features=response.features;
  if(!Array.isArray(features)||features.length<1)throw new Error('No drivable route');
  const f=features[0] as {properties?:{distance?:unknown;time?:unknown};geometry?:{type?:unknown;coordinates?:unknown}};
  const metres=f.properties?.distance,seconds=f.properties?.time;
  const geom=f.geometry;
  if(typeof metres!=='number'||!Number.isFinite(metres)||metres<=0||metres>200000 ||
    typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<=0||
    geom?.type!=='MultiLineString'||!Array.isArray(geom?.coordinates)||
    !geom.coordinates.length) throw new Error('Incomplete or implausible provider route');
  const segments=geom.coordinates;
  for(const line of segments){
    if(!Array.isArray(line)||line.length<2)throw new Error('Invalid road segment');
    for(const pair of line) geometryEndpoint(pair);
  }
  const first=segments[0][0],lastLine=segments[segments.length-1],last=lastLine[lastLine.length-1];
  return {
    direction:dir,metres,seconds,
    snappedStartMetres:Math.round(distanceBetweenMetres(from,geometryEndpoint(first))),
    snappedEndMetres:Math.round(distanceBetweenMetres(to,geometryEndpoint(last))),
    geometry:{type:'MultiLineString',coordinates:segments},
  };
}
/**
 * Makes two real road routing calls: restaurant -> kennel and kennel -> restaurant.
 * It deliberately does not assume a building-centre pin is the vehicle entrance.
 * A returned route is never enough to authorize transport prices.
 */
export async function checkApexAccessRoute(options:{
  apiKey:string;
  fetcher?:typeof fetch;
  now?:Date;
}):Promise<AccessRouteCheck>{
  if(!options.apiKey||options.apiKey.trim().length<12)throw new Error('GEOAPIFY_API_KEY missing or invalid');
  const kennel=APEX_KENNEL_LOCATION.pin;
  const access=APEX_KENNEL_ACCESS.pin;
  if(!access)throw new Error('Bawli waypoint is not configured');
  const fetcher=options.fetcher??fetch;
  const directions:[AccessDirection,GeoPin,GeoPin][]=[
    ['bawli_to_kennel',access,kennel],
    ['kennel_to_bawli',kennel,access],
  ];
  const legs:AccessLeg[]=[];
  for(const [dir,from,to] of directions){
    const url=new URL('https://api.geoapify.com/v1/routing');
    url.searchParams.set('waypoints',from.lat+','+from.lon+'|'+to.lat+','+to.lon);
    url.searchParams.set('mode','drive');
    url.searchParams.set('apiKey',options.apiKey);
    let raw:unknown;
    try{
      const response=await fetcher(url.toString(),{
        method:'GET',redirect:'error',cache:'no-store',
        headers:{Accept:'application/geo+json, application/json'},
        signal:AbortSignal.timeout(8000),
      });
      if(!response.ok)throw new Error('Geoapify returned HTTP '+response.status);
      const body=await response.text();
      if(body.length>300000)throw new Error('Provider response too large');
      raw=JSON.parse(body);
    }catch(e){
      const msg=e instanceof Error?e.message:'request failed';
      // Never include the request URL: Geoapify puts the API key in its query string.
      throw new Error('Routing '+dir+' failed: '+msg.replaceAll(options.apiKey,'[REDACTED]'));
    }
    legs.push(extractLeg(raw,dir,from,to));
  }
  const warnings:string[]=[];
  for(const leg of legs){
    if(leg.snappedStartMetres>150||leg.snappedEndMetres>150){
      warnings.push(leg.direction+': provider road snapped >150m away from a location pin. Inspect the gate/junction.');
    }
    if(leg.metres>30000)warnings.push(leg.direction+': unusually long route; verify roads are actually connected.');
  }
  warnings.push('Confirm visually that Bawli is used to access the kennel on a REAL drivable road.');
  warnings.push('Exact kennel vehicle entrance and Bawli road junction have not been field-verified.');
  return {
    status:'MAP_ROUTE_REQUIRES_HUMAN_VALIDATION',
    checkedAt:(options.now??new Date()).toISOString(),
    provider:'Geoapify Routing',
    accessPin:{...access},kennelPin:{...kennel},
    legs,roundTripMetres:legs.reduce((n,l)=>n+l.metres,0),
    warnings,notForBilling:true,
  };
}
