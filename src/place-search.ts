import {TRANSPORT_SERVICE_BOUNDS,isTransportServiceLocation} from './transport-service-area.ts';

export type PlaceSuggestion={label:string;area:string;latitude:number;longitude:number};
export type SearchLimiter={limit(options:{key:string}):Promise<{success:boolean}>};
export type PlaceSearchEnv={GEOAPIFY_API_KEY?:string;LOCATION_SEARCH_RATE_LIMIT?:SearchLimiter;LOCATION_SEARCH_USAGE_LIMIT?:SearchLimiter};
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const answer=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const safeText=(value:unknown,max:number)=>typeof value==='string'&&!/[\u0000-\u001f\u007f<>]/u.test(value)&&value.length<=max?value.trim():'';

/** Scoped candidates, never confirmed vehicle gates. No raw provider error reaches the client. */
export async function searchLocalPlaces(query:string,key:string,fetcher:typeof fetch=fetch):Promise<PlaceSuggestion[]>{
  const url=new URL('https://api.geoapify.com/v1/geocode/autocomplete');
  url.search=new URLSearchParams({text:query,format:'json',limit:'5',lang:'en',
    filter:'rect:'+TRANSPORT_SERVICE_BOUNDS.join(','),bias:'proximity:73.06,33.65',apiKey:key}).toString();
  const response=await fetcher(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(4500)});
  if(!response.ok)throw new Error('Search unavailable');
  const data=JSON.parse(await boundedText(response,65536)) as {results?:unknown};
  if(!Array.isArray(data.results))throw new Error('Search unavailable');
  const results:PlaceSuggestion[]=[];
  for(const item of data.results.slice(0,10)){
    if(!item||typeof item!=='object')continue;
    const row=item as Record<string,unknown>;
    const label=safeText(row.formatted,400),area=safeText(row.address_line2,240);
    if(!label||typeof row.lat!=='number'||typeof row.lon!=='number'||row.country_code!=='pk'||!isTransportServiceLocation(row.lat,row.lon))continue;
    if(results.some(x=>x.label===label&&x.latitude===row.lat&&x.longitude===row.lon))continue;
    results.push({label,area,latitude:row.lat,longitude:row.lon});if(results.length===5)break;
  }
  return results;
}

async function boundedText(source:Request|Response,limit:number):Promise<string>{
  if(Number(source.headers.get('content-length')??0)>limit)throw new Error('Payload too large');
  const reader=source.body?.getReader();if(!reader)throw new Error('Missing body');
  const chunks:Uint8Array[]=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();throw new Error('Payload too large');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}

/** Missing distributed edge protection fails closed. No keys or query text are logged. */
export async function placeSearchRoute(request:Request,env:PlaceSearchEnv,fetcher:typeof fetch=fetch):Promise<Response>{
  if(request.method!=='POST')return answer({error:'Method not allowed'},405);
  if(request.headers.get('origin')!==new URL(request.url).origin)return answer({error:'Forbidden'},403);
  if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return answer({error:'JSON required'},415);
  if(!env.GEOAPIFY_API_KEY||!env.LOCATION_SEARCH_RATE_LIMIT||!env.LOCATION_SEARCH_USAGE_LIMIT)return answer({error:'Search is unavailable. Use GPS or paste your exact gate pin.'},503);
  let query:string;
  try{
    const body=JSON.parse(await boundedText(request,512));
    if(!body||Array.isArray(body)||Object.keys(body).join(',')!=='query')throw new Error();
    query=safeText(body.query,120);if(query.length<3)throw new Error();
  }catch{return answer({error:'Enter 3–120 characters to search Islamabad or Rawalpindi.'},400);}
  try{
    const ip=request.headers.get('cf-connecting-ip');
    if(!ip)return answer({error:'Search is unavailable. Paste your exact gate pin instead.'},503);
    if(!(await env.LOCATION_SEARCH_RATE_LIMIT.limit({key:ip})).success||
       !(await env.LOCATION_SEARCH_USAGE_LIMIT.limit({key:'apex-location-search'})).success)
      return answer({error:'Search is busy. Wait a minute, use GPS or paste your exact gate pin.'},429);
    return answer({results:await searchLocalPlaces(query,env.GEOAPIFY_API_KEY,fetcher),attribution:'Powered by Geoapify / OpenStreetMap'});
  }catch{return answer({error:'Search could not load. Use GPS or paste your exact gate pin.'},503);}
}
