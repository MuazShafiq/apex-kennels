/**
 * One real, bounded public search per production smoke run.
 * No keys, customers, personal coordinates, writes or retry amplification.
 * Our existing 250/day UTC Durable Object budget includes this request.
 */
const base=new URL(process.env.APEX_WORKER_ORIGIN || 'https://apex-kennels-api.muaz-shafiq18.workers.dev');
if(base.protocol!=='https:' || base.username || base.password || base.search || base.hash || base.pathname!=='/')
  throw new Error('Production search smoke requires a HTTPS origin');
const target=new URL('/api/book/search',base);
const options={
  method:'POST',redirect:'manual',signal:AbortSignal.timeout(12000),
  headers:{'Content-Type':'application/json','Origin':base.origin},
  body:JSON.stringify({query:'F-10 Markaz'})
};

// This check must not consume credits. The Worker denies the wrong origin first.
const denied=await fetch(target,{...options,headers:{...options.headers,Origin:'https://invalid.example'}});
if(denied.status!==403)throw new Error('Location search cross-origin denial failed (HTTP '+denied.status+')');

// Exactly one real Geoapify search. No retries on provider/quota/network errors.
const response=await fetch(target,options);
if(response.status!==200){
  const candidate=response.headers.get('x-apex-search-failure-stage');
  const stage=['rate-limiter','daily-budget','provider'].includes(candidate)?candidate:'unknown';
  const failure=response.headers.get('x-apex-search-provider-failure');
  const safeFailure=/^(network|invalid-response|http-(?:[1-5][0-9]{2}|unknown))$/.test(failure||'')?failure:'unclassified';
  throw new Error('Live location search unavailable (HTTP '+response.status+', stage '+stage+
    (stage==='provider'?', provider '+safeFailure:'')+')');
}
if(response.headers.get('cache-control')!=='no-store')
  throw new Error('Live location search missing no-store');
const length=Number(response.headers.get('content-length')||0);
if(!Number.isFinite(length)||length>32768)throw new Error('Live search response too large');
let raw;
try{raw=await response.text();if(raw.length>32768)throw new Error('Oversized response');}
catch{throw new Error('Live search response could not be read safely');}
let data;
try{data=JSON.parse(raw);}catch{throw new Error('Live search response not JSON');}
if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.results)||
   data.results.length<1||data.results.length>5)
  throw new Error('Live search returned no bounded place suggestions');
for(const item of data.results){
  if(!item||typeof item.label!=='string'||item.label.length<3||item.label.length>400||
     typeof item.latitude!=='number'||typeof item.longitude!=='number'||
     !Number.isFinite(item.latitude)||!Number.isFinite(item.longitude)||
     item.longitude<72.81||item.longitude>73.30||item.latitude<33.43||item.latitude>33.84)
    throw new Error('Live search returned unsafe or out-of-area suggestion');
}
if(!data.results.some(item=>/\bF\s*[- ]\s*10\b/i.test(item.label)))
  throw new Error('Live search returned no F-10 candidate');
if(typeof data.attribution!=='string'||!data.attribution.includes('Geoapify'))
  throw new Error('Live search missing provider attribution');
console.log('PASS production search: cross-origin 403, same-origin 200, relevant bounded F-10 suggestions; 1 provider request');
