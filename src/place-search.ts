import {TRANSPORT_SERVICE_BOUNDS,isTransportServiceLocation} from './transport-service-area.ts';
import {consumeLocationSearchBudget,type LocationSearchBudgetNamespace} from './location-search-budget.ts';

export type PlaceSuggestion={label:string;area:string;latitude:number;longitude:number};
/** Fixed, non-sensitive provider failure code, never the provider response or API key. */
export class PlaceProviderError extends Error {
  readonly kind:'http'|'network'|'invalid-response';
  readonly status?:number;
  constructor(kind:'http'|'network'|'invalid-response',status?:number){
    super('Provider request failed');
    this.kind=kind;
    this.status=status;
  }
}
export type SearchLimiter={limit(options:{key:string}):Promise<{success:boolean}>};
export type PlaceSearchEnv={GEOAPIFY_API_KEY?:string;APEX_LOCATION_SEARCH_DISABLED?:string;LOCATION_SEARCH_BUDGET?:LocationSearchBudgetNamespace;LOCATION_SEARCH_RATE_LIMIT?:SearchLimiter;LOCATION_SEARCH_USAGE_LIMIT?:SearchLimiter};
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const answer=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const safeText=(value:unknown,max:number)=>typeof value==='string'&&!/[\u0000-\u001f\u007f<>]/u.test(value)&&value.length<=max?value.trim():'';

const ROMAN_PHASES=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];
function phases(text:string):string {
  return text.replace(/\bphase\s*[- ]?\s*([ivx]+)\b/gi,(full,numeral:string)=>{
    const index=ROMAN_PHASES.indexOf(numeral.toUpperCase());return index<0?full:'Phase '+(index+1);
  });
}
function sectors(text:string):{sector:string;subsector?:string}[]{
  const matches=text.matchAll(/\b([a-i])\s*[- ]?\s*(\d{1,2})(?:\s*\/\s*([1-4]))?\b/gi);
  return [...matches].map(m=>({sector:m[1].toUpperCase()+'-'+Number(m[2]),...(m[3]?{subsector:m[3]}:{})}));
}
function phaseNumbers(text:string):string[]{return [...phases(text).matchAll(/\bphase\s*[- ]?\s*(\d{1,2})\b/gi)].map(m=>String(Number(m[1])));}
/** Change spelling only, never infer a different place or coordinate. */
export function normalizePlaceQuery(query:string):string {
  let result=phases(query).replace(/\bU\.?S\.?\s+(?=embassy\b)/gi,'United States ');
  // The measured provider misranks sector/phase queries with redundant city
  // suffixes. Geographic restriction remains the exact intake rectangle.
  if(sectors(result).length||phaseNumbers(result).length)
    result=result.replace(/(?:,\s*|\s+)(?:Islamabad|Rawalpindi)\s*$/i,'').trim();
  return result;
}
/** Explicit identifiers must survive provider fuzzy matching. No wrong-sector/phase substitutes. */
export function matchesRequestedPlace(query:string,label:string):boolean {
  const requestedSectors=sectors(query),candidateSectors=sectors(label);
  if(requestedSectors.some(request=>!candidateSectors.some(candidate=>candidate.sector===request.sector&&(!request.subsector||candidate.subsector===request.subsector))))return false;
  const requestedPhases=phaseNumbers(query),candidatePhases=phaseNumbers(label);
  if(requestedPhases.some(phase=>!candidatePhases.includes(phase)))return false;
  if(/\bBahria\b/i.test(query)&&!/\bBahria\b/i.test(label))return false;
  if(/\bDHA\b/i.test(query)&&!/\bDHA\b|\bDefen[cs]e Housing Authority\b/i.test(label))return false;
  if(/\b(?:US|U\.S\.?|United States)\s+embassy\b|\bembassy\s+of\s+(?:the\s+)?United States\b/i.test(query)&&!/\bUnited States\b/i.test(label))return false;
  return true;
}
function relevance(query:string,label:string):number {
  const words=(text:string)=>phases(text).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(word=>!['islamabad','rawalpindi','the','of'].includes(word));
  const requested=words(normalizePlaceQuery(query)),candidate=words(label),title=words(label.split(',')[0]);
  const phrase=requested.join(' '),first=title.join(' ');
  if(first===phrase)return 100;
  if(first.startsWith(phrase+' '))return 80;
  return requested.filter(word=>candidate.includes(word)).length/Math.max(1,requested.length)*20;
}

/** Scoped candidates, never confirmed vehicle gates. No raw provider error reaches the client. */
export async function searchLocalPlaces(query:string,key:string,fetcher:typeof fetch=fetch):Promise<PlaceSuggestion[]>{
  const url=new URL('https://api.geoapify.com/v1/geocode/autocomplete');
  url.search=new URLSearchParams({text:normalizePlaceQuery(query),format:'json',limit:'5',lang:'en',
    filter:'rect:'+TRANSPORT_SERVICE_BOUNDS.join(','),bias:'proximity:73.06,33.65',apiKey:key}).toString();
  let response:Response;
  try{response=await fetcher(url,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(4500)});}
  catch{throw new PlaceProviderError('network');}
  if(!response.ok)throw new PlaceProviderError('http',response.status);
  let data:{results?:unknown};
  try{data=JSON.parse(await boundedText(response,65536)) as {results?:unknown};}
  catch{throw new PlaceProviderError('invalid-response');}
  if(!Array.isArray(data.results))throw new PlaceProviderError('invalid-response');
  const results:PlaceSuggestion[]=[];
  for(const item of data.results.slice(0,10)){
    if(!item||typeof item!=='object')continue;
    const row=item as Record<string,unknown>;
    const label=safeText(row.formatted,400),area=safeText(row.address_line2,240);
    if(!label||typeof row.lat!=='number'||typeof row.lon!=='number'||row.country_code!=='pk'||!isTransportServiceLocation(row.lat,row.lon)||!matchesRequestedPlace(query,label))continue;
    if(results.some(x=>x.label===label&&x.latitude===row.lat&&x.longitude===row.lon))continue;
    results.push({label,area,latitude:row.lat,longitude:row.lon});if(results.length===5)break;
  }
  return results.sort((a,b)=>relevance(query,b.label)-relevance(query,a.label));
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
  if(env.APEX_LOCATION_SEARCH_DISABLED==='true'||!env.GEOAPIFY_API_KEY||!env.LOCATION_SEARCH_BUDGET||!env.LOCATION_SEARCH_RATE_LIMIT||!env.LOCATION_SEARCH_USAGE_LIMIT)return answer({error:'Search is unavailable. Use GPS or paste your exact gate pin.'},503);
  let query:string;
  try{
    const body=JSON.parse(await boundedText(request,512));
    if(!body||Array.isArray(body)||Object.keys(body).join(',')!=='query')throw new Error();
    query=safeText(body.query,120);if(query.length<3)throw new Error();
  }catch{return answer({error:'Enter 3–120 characters to search Islamabad or Rawalpindi.'},400);}
  // Only a fixed failure stage is exposed: never a key, provider body, IP or query.
  // This permits the credential-free production smoke to locate failures safely.
  const unavailable=(stage:'rate-limiter'|'daily-budget'|'provider')=>{
    const result=answer({error:'Search could not load. Use GPS or paste your exact gate pin.'},503);
    result.headers.set('x-apex-search-failure-stage',stage);
    return result;
  };
  const ip=request.headers.get('cf-connecting-ip');
  if(!ip)return answer({error:'Search is unavailable. Paste your exact gate pin instead.'},503);
  try{
    if(!(await env.LOCATION_SEARCH_RATE_LIMIT.limit({key:ip})).success||
       !(await env.LOCATION_SEARCH_USAGE_LIMIT.limit({key:'apex-location-search'})).success)
      return answer({error:'Search is busy. Wait a minute, use GPS or paste your exact gate pin.'},429);
  }catch{return unavailable('rate-limiter');}
  try{
    if(!(await consumeLocationSearchBudget(env.LOCATION_SEARCH_BUDGET)).success)
      return unavailable('daily-budget');
  }catch{return unavailable('daily-budget');}
  try{
    return answer({results:await searchLocalPlaces(query,env.GEOAPIFY_API_KEY,fetcher),attribution:'Powered by Geoapify / OpenStreetMap'});
  }catch(error){
    const result=unavailable('provider');
    if(error instanceof PlaceProviderError){
      const detail=error.kind==='http'?'http-'+(error.status??'unknown'):error.kind;
      result.headers.set('x-apex-search-provider-failure',detail);
    }
    return result;
  }
}
