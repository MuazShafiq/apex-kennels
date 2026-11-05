import type {AccessRouteCheck} from './check-apex-access-route.ts';

/** Creates one local static basemap for a VALIDATED ROUTE GEOMETRY preview.
 * This is only map visualization and never approves access roads or billing.
 */
export type StaticMapFrame={
  width:1024;
  height:700;
  zoom:number;
  center:{lon:number;lat:number};
  /** Leaflet imageOverlay bounds: [[south, west], [north, east]]. */
  bounds:[[number,number],[number,number]];
};

const DEG=Math.PI/180;
function mercator(lon:number,lat:number):{x:number;y:number}{
  const sine=Math.sin(Math.min(85,Math.max(-85,lat))*DEG);
  return {x:(lon+180)/360,y:0.5-Math.log((1+sine)/(1-sine))/(4*Math.PI)};
}
function unproject(x:number,y:number):{lon:number;lat:number}{
  return {lon:x*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*y)))/DEG};
}

export function frameForAccessRoute(route:AccessRouteCheck):StaticMapFrame{
  const pts:number[][]=[
    [route.accessPin.lon,route.accessPin.lat],
    [route.kennelPin.lon,route.kennelPin.lat],
    ...route.legs.flatMap(leg=>leg.geometry.coordinates.flat())
  ];
  if(!pts.length||pts.some(p=>!Number.isFinite(p[0])||!Number.isFinite(p[1]))) {
    throw new Error('Invalid route geometry cannot be framed');
  }
  const proj=pts.map(p=>mercator(p[0],p[1]));
  const xmin=Math.min(...proj.map(p=>p.x)),xmax=Math.max(...proj.map(p=>p.x));
  const ymin=Math.min(...proj.map(p=>p.y)),ymax=Math.max(...proj.map(p=>p.y));
  const width=1024,height=700,padding=95;
  const zoomCandidate=Math.min(
    Math.log2((width-2*padding)/(256*Math.max(1e-9,xmax-xmin))),
    Math.log2((height-2*padding)/(256*Math.max(1e-9,ymax-ymin))),
    18
  );
  const zoom=Math.max(8,Math.floor(zoomCandidate*100)/100);
  const world=256*Math.pow(2,zoom);
  const cx=(xmin+xmax)/2,cy=(ymin+ymax)/2;
  const southwest=unproject(cx-width/(2*world),cy+height/(2*world));
  const northeast=unproject(cx+width/(2*world),cy-height/(2*world));
  return {
    width:1024,height:700,zoom,
    center:unproject(cx,cy),
    bounds:[[southwest.lat,southwest.lon],[northeast.lat,northeast.lon]],
  };
}

export type BasemapFetcher=typeof fetch;
/** Never serialize the API-key-bearing request URL, even on fetch failure. */
export async function downloadGeoapifyBasemap(
  frame:StaticMapFrame,
  key:string,
  fetcher:BasemapFetcher=fetch
):Promise<Uint8Array>{
  if(key.length<12)throw new Error('Geoapify map API key is missing');
  const url=new URL('https://maps.geoapify.com/v1/staticmap');
  url.searchParams.set('style','osm-bright');
  url.searchParams.set('width',String(frame.width));
  url.searchParams.set('height',String(frame.height));
  url.searchParams.set('center','lonlat:'+frame.center.lon+','+frame.center.lat);
  url.searchParams.set('zoom',String(frame.zoom));
  url.searchParams.set('format','png');
  url.searchParams.set('apiKey',key);
  let response:Response;
  try{
    response=await fetcher(url.toString(),{
      method:'GET',redirect:'error',cache:'no-store',
      headers:{Accept:'image/png'},signal:AbortSignal.timeout(12000)
    });
  }catch{
    throw new Error('Static basemap request failed; check Geoapify access');
  }
  if(!response.ok)throw new Error('Geoapify static map returned HTTP '+response.status);
  const contentType=response.headers.get('content-type')?.split(';')[0].trim();
  if(contentType!=='image/png')throw new Error('Geoapify static map did not return PNG');
  const length=Number(response.headers.get('content-length')??0);
  if(length>8_000_000)throw new Error('Static map exceeds size limit');
  let buffer:Uint8Array;
  try{buffer=new Uint8Array(await response.arrayBuffer());}
  catch{throw new Error('Unable to read Geoapify static map');}
  if(buffer.length<16||buffer.length>8_000_000 ||
    ![137,80,78,71,13,10,26,10].every((n,i)=>buffer[i]===n)){
    throw new Error('Geoapify static map returned invalid PNG');
  }
  return buffer;
}
