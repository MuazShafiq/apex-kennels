/**
 * Minimal server-side Geoapify autocomplete. Do not disclose the API key in the browser.
 * Search locates a neighbourhood/place, then the customer can move the pin to the gate.
 */
export type PlaceSuggestion={label:string;latitude:number;longitude:number};
export function parsePlaceQuery(url:URL):string{
  if([...url.searchParams.keys()].some(x=>x!=='q'&&x!=='area')||url.searchParams.getAll('q').length!==1||url.searchParams.getAll('area').length>1)
    throw new Error('Invalid search');
  const query=(url.searchParams.get('q')??'').trim().replace(/\s+/g,' ');
  if(query.length<3||query.length>90||/[\u0000-\u001f\u007f]/.test(query))
    throw new Error('Invalid search');
  return query;
}
export async function searchPakistaniPlaces(
  query:string,apiKey:string,fetcher:typeof fetch=fetch
):Promise<PlaceSuggestion[]> {
  if(!apiKey||apiKey.length<12)throw new Error('Location search unavailable');
  if(query.length<3||query.length>90)throw new Error('Invalid search');
  const url=new URL('https://api.geoapify.com/v1/geocode/autocomplete');
  url.searchParams.set('text',query);
  url.searchParams.set('format','json');
  url.searchParams.set('filter','countrycode:pk');
  url.searchParams.set('bias','proximity:73.0479,33.6844');
  url.searchParams.set('limit','5');
  url.searchParams.set('lang','en');
  url.searchParams.set('apiKey',apiKey);
  const res=await fetcher(url.toString(),{
    method:'GET',headers:{Accept:'application/json'},redirect:'manual',cache:'no-store',
    signal:AbortSignal.timeout(4800)
  });
  if(!res.ok)throw new Error('Location search unavailable');
  const raw=await res.text();
  if(raw.length>55000)throw new Error('Location search unavailable');
  const parsed:unknown=JSON.parse(raw);
  const results=(parsed&&typeof parsed==='object'&&'results' in parsed)
    ? (parsed as {results:unknown}).results:null;
  if(!Array.isArray(results))throw new Error('Location search unavailable');
  const seen=new Set<string>(),output:PlaceSuggestion[]=[];
  for(const item of results){
    if(!item||typeof item!=='object')continue;
    const place=item as Record<string,unknown>;
    const latitude=place.lat,longitude=place.lon,formatted=place.formatted;
    if(place.country_code!=='pk'||typeof latitude!=='number'||typeof longitude!=='number'
       ||latitude<23||latitude>38||longitude<60||longitude>78
       ||typeof formatted!=='string'||!formatted.trim())continue;
    const label=formatted.trim().slice(0,180),key=latitude.toFixed(5)+':'+longitude.toFixed(5);
    if(seen.has(key))continue;
    seen.add(key);output.push({label,latitude,longitude});
    if(output.length===5)break;
  }
  return output;
}
