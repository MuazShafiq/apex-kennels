import type {SharedPinResolution} from './shared-map-pin.ts';

/** Limit staff-supplied map links before invoking external URL resolution. */
export async function readPinForm(request:Request):Promise<string>{
  const limit=2400;
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')){
    throw new Error('Expected a form');
  }
  const declared=request.headers.get('content-length');
  if(declared!==null && (!/^\d+$/.test(declared)||Number(declared)>limit)){
    throw new Error('Form too large');
  }
  const reader=request.body?.getReader();
  if(!reader)throw new Error('Empty form');
  let total=0;
  const chunks:Uint8Array[]=[];
  try{
    for(;;){
      const {value,done}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>limit)throw new Error('Form too large');
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);
  let offset=0;
  for(const b of chunks){bytes.set(b,offset);offset+=b.length;}
  const data=new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(data.getAll('pinUrl').length!==1 || [...data.keys()].some(k=>k!=='pinUrl')) {
    throw new Error('Unexpected form fields');
  }
  const url=data.get('pinUrl')?.trim()??'';
  if(url.length<3||url.length>2048)throw new Error('Invalid location link');
  return url;
}

/** Internal staff utility only; never displays or stores raw customer URL. */
export function renderStaffPinChecker(result?:SharedPinResolution):string{
  const valid=result?.ok===true;
  const outcome=result
    ? valid
      ? '<div class="result"><strong>Map pin located.</strong>'
        +'<p class="coords">'+result.pin.lat.toFixed(7)+', '+result.pin.lon.toFixed(7)+'</p>'
        +'<p>This pin is NOT confirmed as the property gate. Ask the customer to confirm it before transport pricing.</p>'
        +'<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps?q='
        +result.pin.lat+','+result.pin.lon+'">Inspect pin in Google Maps</a></div>'
      : '<div class="notice"><strong>Could not verify an exact pin.</strong>'
        +'<p>Ask for a static dropped Google Maps pin, not a map screenshot, typed address or live-location stream.</p></div>'
    : '';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    +'<meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<meta name="robots" content="noindex,nofollow"><title>Apex | Location review</title>'
    +'<style>:root{font-family:Inter,system-ui,sans-serif;background:#f6f7f5;color:#193b2d}'
    +'*{box-sizing:border-box}body{margin:0}.shell{max-width:700px;margin:54px auto;padding:0 20px}'
    +'a{color:#286e50}h1{font-size:clamp(28px,4vw,42px);letter-spacing:-.04em;margin:15px 0}'
    +'.kicker{font-size:11px;letter-spacing:.15em;color:#788d7c;font-weight:750}'
    +'.panel{background:#fff;border:1px solid #dae6dc;border-radius:16px;padding:26px;margin:22px 0}'
    +'p{font-size:13px;line-height:1.65;color:#526c5d}label{font-weight:700;font-size:13px}'
    +'textarea{width:100%;height:110px;padding:13px;border:1px solid #cad7cf;border-radius:8px;display:block;margin:10px 0 16px;font:inherit;font-size:13px}'
    +'button{background:#244b38;color:white;border:0;border-radius:8px;padding:12px 18px;font-weight:700;cursor:pointer}'
    +'.notice,.result{padding:20px;border-radius:10px;background:#f6eddb;color:#694d25;margin:20px 0}'
    +'.result{background:#e8f3eb;color:#225d42}.coords{font-size:22px;font-weight:750;letter-spacing:-.025em;color:#193b2d}'
    +'.fine{font-size:11px;color:#718577}</style></head><body><main class="shell">'
    +'<a href="/staff">← Booking queue</a>'
    +'<div class="kicker" style="margin-top:35px">APEX KENNELS / STAFF ONLY</div>'
    +'<h1>Check a customer location.</h1>'
    +'<p>Paste a customer-shared Google Maps pin or exact coordinates. The system will identify the selected location, not the map viewport.</p>'
    +'<div class="panel"><form action="/staff/location" method="post" accept-charset="utf-8">'
    +'<label for="pinUrl">Static location pin</label>'
    +'<textarea id="pinUrl" name="pinUrl" required maxlength="2048" placeholder="https://maps.app.goo.gl/..."></textarea>'
    +'<button type="submit">Check location</button></form></div>'
    +outcome
    +'<p class="fine">Internal tool. No booking record, location or invoice is saved. '
    +'The route and exact gate still require separate confirmation.</p></main></body></html>';
}
