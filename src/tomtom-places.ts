import type {PlaceSuggestion} from './location-suggestions.ts';

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
