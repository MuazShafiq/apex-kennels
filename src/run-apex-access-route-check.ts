import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkApexAccessRoute} from './check-apex-access-route.ts';
import {frameForAccessRoute,downloadGeoapifyBasemap} from './apex-access-basemap.ts';

/** One-session environment variable only. No credentials are saved. */
const key=process.env.GEOAPIFY_API_KEY?.trim();
if(!key){
  console.error('Missing GEOAPIFY_API_KEY. Set it as a local shell environment variable.');
  process.exitCode=1;
}else{
  try{
    const result=await checkApexAccessRoute({apiKey:key});
    const dir=join(dirname(fileURLToPath(import.meta.url)),'../output');
    mkdirSync(dir,{recursive:true});
    writeFileSync(join(dir,'apex-access-road-review.json'),JSON.stringify(result,null,2),'utf8');
    const frame=frameForAccessRoute(result);
    let basemapReady=false;
    try {
      const png=await downloadGeoapifyBasemap(frame,key);
      writeFileSync(join(dir,'apex-access-basemap.png'),png);
      basemapReady=true;
      console.log('Geoapify background map saved locally; no API key embedded in HTML.');
    } catch {
      console.log('Geoapify background unavailable. Route lines remain viewable without map imagery.');
    }
    const safeJson=JSON.stringify(result).replace(/</g,'\\u003c');
    const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<title>Apex road check - INTERNAL ONLY</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
html,body{margin:0;background:#f4f5f4;font-family:Arial,sans-serif;color:#193128}
main{max-width:1000px;margin:20px auto;padding:0 16px}
h1{font-size:24px;margin:8px 0}p{font-size:13px;line-height:1.6}
small{color:#a14d27;font-weight:bold;letter-spacing:.09em}
#map{height:520px;border-radius:8px;background:#dce9df}
.cards{display:flex;gap:12px;margin:16px 0;flex-wrap:wrap}
.card{padding:15px;background:white;border:1px solid #d9e1db;border-radius:8px;flex:1;min-width:220px}
.card strong{font-size:20px}ul{font-size:13px;line-height:1.7}
.notice{border-left:3px solid #b47e25;background:#fff6e1;padding:12px;margin-top:16px}
@media(max-width:600px){#map{height:360px}}
</style></head><body><main>
<small>INTERNAL ROAD VALIDATION · NOT FOR BILLING</small>
<h1>Bawli Restaurant ↔ Apex Kennels</h1>
<p>Two independent drivable-route queries. Check that the colored lines follow the actual entrance road. A successful API result does not prove a road exists in reality.</p>
<div class="cards" id="stats"></div>
<p id="basemap-warning" hidden style="background:#fff4de;padding:9px;border-radius:5px">Background map unavailable. The route geometry still renders, but road validation needs map imagery.</p>
<div id="map"></div>
<div class="notice"><strong>Manual checks required</strong><ul id="warnings"></ul></div>
<p>Routing and map imagery powered by <a href="https://www.geoapify.com/">Geoapify</a>. Map © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> / © <a href="https://openmaptiles.org/">OpenMapTiles</a>. No API key or customer information is embedded.</p>
</main><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const data=__DATA__;
document.getElementById('stats').innerHTML=data.legs.map(x=>
 '<div class="card"><b>'+(x.direction==='bawli_to_kennel'?'Bawli → Kennel':'Kennel → Bawli')+'</b><p><strong>'+
 (x.metres/1000).toFixed(2)+' km</strong><br>'+
 Math.round(x.seconds/60)+' min estimated<br>Start snap: '+x.snappedStartMetres+'m · End snap: '+x.snappedEndMetres+'m</p></div>'
).join('');
document.getElementById('warnings').innerHTML=data.warnings.map(w=>'<li>'+w+'</li>').join('');
if(typeof L!=='undefined'){
 const map=L.map('map');
 // This image is a Geoapify Static Maps PNG downloaded once by Node.
 // The HTML contains no API key and makes NO requests to public OSM tile servers.
 if(__BASEMAP_READY__){
  L.imageOverlay('./apex-access-basemap.png',__FRAME_BOUNDS__,{
   interactive:false,opacity:1
  }).addTo(map);
 }else{
  document.getElementById('basemap-warning').hidden=false;
 }
 const bounds=L.latLngBounds([]);
 for(const leg of data.legs){
  const line=L.geoJSON({type:'Feature',geometry:leg.geometry,properties:{}},{
   style:{color:leg.direction==='bawli_to_kennel'?'#287c66':'#bd7541',weight:5}
  }).addTo(map);
  bounds.extend(line.getBounds());
 }
 L.marker([data.accessPin.lat,data.accessPin.lon]).bindPopup('Bawli restaurant: mapped building point, NOT verified turn').addTo(map);
 L.marker([data.kennelPin.lat,data.kennelPin.lon]).bindPopup('Apex Kennels: mapped site, entrance not verified').addTo(map);
 if(bounds.isValid())map.fitBounds(bounds.pad(.15));
 else map.setView([data.kennelPin.lat,data.kennelPin.lon],14);
}
</script></body></html>`;
    writeFileSync(join(dir,'apex-access-road-review.html'),
      html.replace('__DATA__',safeJson)
        .replace('__BASEMAP_READY__',String(basemapReady))
        .replace('__FRAME_BOUNDS__',JSON.stringify(frame.bounds)),'utf8');
    console.log('Geoapify returned two driving routes. ROAD VALIDITY IS NOT VERIFIED.');
    for(const leg of result.legs){
      console.log((leg.direction==='bawli_to_kennel'?'Bawli -> Kennel':'Kennel -> Bawli')+
        ': '+(leg.metres/1000).toFixed(2)+' km, '+Math.round(leg.seconds/60)+' min');
      console.log('  Road snaps: '+leg.snappedStartMetres+'m start, '+leg.snappedEndMetres+'m end.');
    }
    console.log('Total round trip: '+(result.roundTripMetres/1000).toFixed(2)+' km. NOT APPROVED FOR BILLING.');
    for(const w of result.warnings)console.log('CHECK: '+w);
    console.log('Open output/apex-access-road-review.html and review the route visually.');
    if(basemapReady)console.log('Basemap: output/apex-access-basemap.png (Geoapify source; no key).');
    console.log('Source-only route details: output/apex-access-road-review.json');
  }catch(e){
    const message=e instanceof Error?e.message:'Unknown routing failure';
    console.error('Access road check failed:',message.replaceAll(key,'[REDACTED]'));
    process.exitCode=1;
  }
}
