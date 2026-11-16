/** No-write gate-picker smoke: public assets and local-only exact-pin parsing. */
const base=new URL(process.env.APEX_WORKER_ORIGIN||'https://apex-kennels-api.muaz-shafiq18.workers.dev');
if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/')
  throw new Error('Gate-picker smoke requires a HTTPS origin');
const request=(path,options={})=>fetch(new URL(path,base),{redirect:'manual',signal:AbortSignal.timeout(12000),...options});
const page=await request('/book');
if(page.status!==200)throw new Error('Booking preview unavailable');
const html=await page.text();
for(const marker of ['id="maps-link"','id="locate"','id="same-dropoff"','id="transport-none"','id="gate-picker"','id="choose-map"','id="map-confirm"'])
  if(!html.includes(marker))throw new Error('Missing gate-picker control: '+marker);
if(html.includes('id="place-search"')||html.includes('id="dropoff-place-search"'))throw new Error('Retired autocomplete returned');
const app=await request('/book/app.js');
if(app.status!==200)throw new Error('Gate-picker script unavailable');
const js=await app.text();
if(!js.includes('maplibre')||!js.includes('tiles.openfreemap.org')||js.includes('/api/book/search'))
  throw new Error('Expected free map picker and retired-search removal');
const assets=[...new Set(js.match(/\/book\/vendor\/maplibre[-a-z0-9.]+\.(?:js|css)/g)||[])];
if(assets.length!==3)throw new Error('Expected one pinned local MapLibre library, worker and stylesheet');
for(const path of assets){
  const asset=await request(path);
  if(asset.status!==200)throw new Error('Local map asset unavailable: '+path);
  const type=asset.headers.get('content-type')||'';
  if(!(path.endsWith('.css')?/text\/css/:/(?:javascript|ecmascript)/).test(type))throw new Error('Wrong map asset content type');
  const bytes=new Uint8Array(await asset.arrayBuffer());
  if(bytes.length<1000||bytes.length>2_000_000)throw new Error('Unexpected map asset size');
}
// No short URLs: these inputs parse locally, without Google/provider HTTP or database writes.
for(const [origin,link,status,code] of [
  [base.origin,'https://www.google.com/maps/search/?api=1&query=33.7%2C73.08',200,null],
  [base.origin,'https://www.google.com/maps/@33.7,73.08,14z',422,'NOT_EXACT_PIN'],
  [base.origin,'https://www.google.com/maps/search/?api=1&query=31.5%2C74.3',422,'OUT_OF_SERVICE_AREA'],
  ['https://invalid.example','33.7,73.08',403,null]
]){
  const response=await request('/api/book/location',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({link})});
  if(response.status!==status)throw new Error('Exact-pin validation returned '+response.status+' (expected '+status+')');
  const data=await response.json();
  if(code&&data.code!==code)throw new Error('Wrong exact-pin rejection');
  if(status===200&&(data.latitude!==33.7||data.longitude!==73.08))throw new Error('Exact pin changed');
}
const retired=await request('/api/book/search',{method:'POST',headers:{'Content-Type':'application/json',Origin:base.origin},body:'{"query":"synthetic-retired-check"}'});
if(retired.status!==404)throw new Error('Retired customer search is still available');
console.log('PASS gate-picker controls/script, exact pin, ambiguous/outside/cross-origin rejection and retired search; no provider calls or writes');
