/** Explicit post-approval monitor. Empty envelopes fail before Turnstile/persistence. */
import {pathToFileURL} from 'node:url';

const workerOrigin='https://apex-kennels-api.muaz-shafiq18.workers.dev';
const pagesOrigin='https://apexkennels.pages.dev';

async function checkLiveBooking(request,origin){
  const config=await request('/api/book/config');
  if(config.status!==200)throw new Error('Cutover config unavailable on '+origin);
  const data=await config.json();
  if(data.enabled!==true||typeof data.siteKey!=='string'||!data.siteKey.trim())
    throw new Error('Public booking is not configured live on '+origin);
  // Never include a booking or security token; parser rejects {} before external calls.
  for(const [originHeader,expected] of [[origin,400],['https://invalid.example',403]]){
    const response=await request('/api/book',{
      method:'POST',headers:{'Content-Type':'application/json',Origin:originHeader},body:'{}'
    });
    if(response.status!==expected)throw new Error('Cutover invalid-envelope/origin rejection failed on '+origin);
  }
}

export async function checkBookingCutover(origin,fetcher=fetch){
  const base=new URL(origin);
  if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)
    throw new Error('Cutover monitor requires a HTTPS origin');
  const requestAt=(host)=>(path,options={})=>fetcher(new URL(path,host),{
    redirect:'manual',signal:AbortSignal.timeout(12000),...options
  });
  const request=requestAt(base);
  const health=await request('/api/health');
  if(health.status!==200)throw new Error('Cutover health unavailable');
  const identity=await health.json();
  if(identity.status!=='ok'||identity.service!=='apex-intake')throw new Error('Wrong Worker identity');
  await checkLiveBooking(request,base.origin);
  // Keep security evidence in the live mode without reading staff/customer records.
  for(const path of ['/staff','/staff/booking','/staff/draft','/staff/invoices']){
    const response=await request(path);
    if(![302,303,401,403].includes(response.status))throw new Error('Anonymous staff denial failed');
    if([302,303].includes(response.status)){
      const target=new URL(response.headers.get('location')||'',base);
      if(target.protocol!=='https:'||!target.hostname.endsWith('.cloudflareaccess.com'))
        throw new Error('Unexpected staff authentication redirect');
    }
  }
  if(base.origin===workerOrigin){
    const pagesRequest=requestAt(pagesOrigin);
    await checkLiveBooking(pagesRequest,pagesOrigin);
    for(const path of ['/staff','/staff/api/bookings','/staff/booking/action','/api/ingest']){
      const response=await pagesRequest(path);
      if(response.status!==404)throw new Error('Pages private route did not return 404: '+path);
    }
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  await checkBookingCutover(process.env.APEX_WORKER_ORIGIN||workerOrigin);
  console.log('PASS live booking config, empty-envelope/origin rejection and private routes (Worker and canonical Pages when in production)');
}
