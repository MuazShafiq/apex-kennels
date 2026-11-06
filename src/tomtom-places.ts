import type {PlaceSuggestion} from './location-suggestions.ts';
import {TRANSPORT_SERVICE_BOUNDS,isTransportServiceLocation} from './transport-service-area.ts';

/**
 * TomTom Orbis Places Discover: resolved POIs and addresses, not road-name
 * autocomplete. A single result includes coordinates for the draggable pin.
 * No client-side key and no paid fallback.
 */
export async function searchTomTomPlaces(
  query:string,key:string,fetcher:typeof fetch=fetch
):Promise<PlaceSuggestion[]>{
  if(typeof key!=='string'||key.length<12)throw new Error('Place search unavailable');
  if(typeof query!=='string'||query.length<3||query.length>90)throw new Error('Invalid search');
  const response=await fetcher('https://api.tomtom.com/maps/orbis/places/discover',{
    method:'POST',
    headers:{
      'TomTom-Api-Key':key,
      'TomTom-Api-Version':'3',
      'Attributes':'results(id,type,title,subtitles,position,address.countryCodeIso2)',
      'Accept':'application/json',
      'Content-Type':'application/json',
      'Accept-Language':'en-PK,en'
    },
    redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(5000),
    body:JSON.stringify({
      query,
      maxResults:5,
      geopoliticalView:'PK',
      filters:{types:['poi','address','street','area'],countryCodesIso2:['PK']},
      preferences:{geometry:{type:'point',coordinates:[73.0479,33.6844]}}
    })
  });
  if(!response.ok)throw new Error('Place search unavailable');
  const raw=await response.text();
  if(raw.length>64000)throw new Error('Place search unavailable');
  const parsed:unknown=JSON.parse(raw);
  const rows=parsed&&typeof parsed==='object'&&'results' in parsed
    ?(parsed as {results:unknown}).results:null;
  if(!Array.isArray(rows))throw new Error('Place search unavailable');
  const items:PlaceSuggestion[]=[],seen=new Set<string>();
  for(const rawItem of rows){
    if(!rawItem||typeof rawItem!=='object')continue;
    const place=rawItem as Record<string,unknown>;
    const position=place.position;
    if(!position||typeof position!=='object')continue;
    const pos=position as Record<string,unknown>;
    if(pos.type!=='Point'||!Array.isArray(pos.coordinates)||pos.coordinates.length!==2)continue;
    const [longitude,latitude]=pos.coordinates;
    if(typeof longitude!=='number'||typeof latitude!=='number'||
       !Number.isFinite(longitude)||!Number.isFinite(latitude)||
       longitude<60||longitude>78||latitude<23||latitude>38)continue;
    const country=(place.address&&typeof place.address==='object'
      ?(place.address as Record<string,unknown>).countryCodeIso2:undefined);
    if(country!==undefined&&country!=='PK')continue;
    if(typeof place.title!=='string'||!place.title.trim())continue;
    const secondary=Array.isArray(place.subtitles)
      ?place.subtitles.filter((x):x is string=>typeof x==='string'&&!!x.trim()).slice(0,2)
      :[];
    const label=[place.title,...secondary].join(', ').slice(0,180);
    const dedupe=latitude.toFixed(5)+':'+longitude.toFixed(5);
    if(seen.has(dedupe))continue;
    seen.add(dedupe);items.push({label,latitude,longitude});
    if(items.length>=5)break;
  }
  return items;
}

/** TomTom's Suggest API is meant for typing; Discover (above) is for complete queries. */
export type TomTomSuggestion={label:string;placeId:string;placeType:'pois'|'addresses'|'streets'|'intersections'|'areas'};
export class TomTomPlacesError extends Error{
  readonly status:number;
  constructor(status:number){super('Place search provider failed');this.status=status;}
}
const typeMap:Record<string,TomTomSuggestion['placeType']>={
  poi:'pois',address:'addresses',street:'streets',intersection:'intersections',area:'areas'
};
const validId=(id:unknown):id is string=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(id);
function tomTomKey(key:string):void{
  if(!key||key.length<12)throw new TomTomPlacesError(503);
}
async function boundedJson(response:Response):Promise<unknown>{
  if(!response.ok)throw new TomTomPlacesError(response.status);
  const raw=await response.text();
  if(raw.length>64000)throw new TomTomPlacesError(502);
  try{return JSON.parse(raw) as unknown;}
  catch{throw new TomTomPlacesError(502);}
}
export function normalizeTomTomQuery(query:string):string{
  return query.normalize('NFKC').replace(/\bU\s*\.\s*S\s*\./gi,'US')
    .replace(/\bU\s*\.\s*S\b/gi,'US').replace(/\s+/g,' ').trim();
}
const terms=(text:string)=>normalizeTomTomQuery(text).toLowerCase()
  .replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
export function matchesPlaceQuery(query:string,label:string):boolean{
  const words=terms(query),candidate=terms(label);
  if(!words.length||!candidate.length)return false;
  // Normalize the common embassy naming variants, without allowing unrelated
  // spellings such as "Rayaz" to match the word "Raya".
  const isUS=(word:string)=>['us','usa','american'].includes(word);
  return words.every(word=>
    word==='us'
      ?candidate.some(isUS)||candidate.includes('united')&&candidate.includes('states')
      :candidate.includes(word)
  );
}
export async function suggestTomTomPlaces(
  query:string,key:string,fetcher:typeof fetch=fetch
):Promise<TomTomSuggestion[]>{
  tomTomKey(key);
  query=normalizeTomTomQuery(query);
  if(query.length<3||query.length>90)throw new TomTomPlacesError(400);
  const response=await fetcher('https://api.tomtom.com/maps/orbis/places/suggest',{
    method:'POST',
    headers:{
      'TomTom-Api-Key':key,'TomTom-Api-Version':'3',
      'Attributes':'results(id,type,title,subtitles,address.countryCodeIso2)',
      'Accept':'application/json','Content-Type':'application/json','Accept-Language':'en-PK,en'
    },
    redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(5000),
    body:JSON.stringify({
      query,maxResults:10,geopoliticalView:'PK',
      filters:{
        types:['poi','address','street','intersection','area'],
        countryCodesIso2:['PK'],
        geometry:{type:'rectangle',coordinates:[...TRANSPORT_SERVICE_BOUNDS]}
      },
      preferences:{geometry:{type:'point',coordinates:[73.0479,33.6844]}}
    })
  });
  const parsed=await boundedJson(response);
  if(!parsed||typeof parsed!=='object'||!('results' in parsed)||
     !Array.isArray(parsed.results))throw new TomTomPlacesError(502);
  const out:TomTomSuggestion[]=[],seen=new Set<string>();
  for(const raw of parsed.results){
    if(!raw||typeof raw!=='object')continue;
    const r=raw as Record<string,unknown>;
    const type=typeof r.type==='string'?typeMap[r.type]:undefined;
    if(!type||!validId(r.id)||typeof r.title!=='string'||!r.title.trim())continue;
    const subt=Array.isArray(r.subtitles)
      ?r.subtitles.filter((x):x is string=>typeof x==='string'&&!!x.trim()).slice(0,2):[];
    const label=[r.title,...subt].join(', ').slice(0,180);
    const address=r.address&&typeof r.address==='object' ?r.address as Record<string,unknown>:null;
    if(address?.countryCodeIso2 && address.countryCodeIso2!=='PK')continue;
    if(!matchesPlaceQuery(query,label))continue;
    const unique=type+':'+r.id;
    if(seen.has(unique))continue;
    seen.add(unique);out.push({label,placeId:r.id,placeType:type});
    if(out.length>=5)break;
  }
  return out;
}
export async function resolveTomTomPlace(
  type:TomTomSuggestion['placeType'],id:string,key:string,fetcher:typeof fetch=fetch
):Promise<PlaceSuggestion>{
  tomTomKey(key);
  if(!(['pois','addresses','streets','intersections','areas'] as string[]).includes(type)||!validId(id))
    throw new TomTomPlacesError(400);
  const url='https://api.tomtom.com/maps/orbis/places/details/'+type+'/'+encodeURIComponent(id);
  const response=await fetcher(url,{
    method:'GET',headers:{
      'TomTom-Api-Key':key,'TomTom-Api-Version':'3',
      'Attributes':'id,type,title,position,address(countryCodeIso2)',
      Accept:'application/json'
    },
    redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(5000)
  });
  const parsed=await boundedJson(response);
  if(!parsed||typeof parsed!=='object')throw new TomTomPlacesError(502);
  const r=parsed as Record<string,unknown>;
  const pos=r.position&&typeof r.position==='object'
    ?r.position as Record<string,unknown>:null;
  const coords=pos?.coordinates;
  if(pos?.type!=='Point'||!Array.isArray(coords)||coords.length!==2||
     !coords.every(x=>typeof x==='number'&&Number.isFinite(x)))throw new TomTomPlacesError(502);
  const [longitude,latitude]=coords;
  if(!isTransportServiceLocation(latitude,longitude))throw new TomTomPlacesError(422);
  const addr=r.address&&typeof r.address==='object'?(r.address as Record<string,unknown>):null;
  if(addr?.countryCodeIso2!==undefined&&addr.countryCodeIso2!=='PK')throw new TomTomPlacesError(422);
  return {
    label:typeof r.title==='string'&&r.title.trim()?r.title.trim().slice(0,180):'Selected location',
    latitude,longitude
  };
}
