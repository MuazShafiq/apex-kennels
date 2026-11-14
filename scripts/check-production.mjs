/**
 * No-credential, no-customer-data Apex Worker verification.
 * Retry after merges because GitHub Actions may start before Cloudflare finishes deploying.
 */
const origin=process.env.APEX_WORKER_ORIGIN || 'https://apex-kennels-api.muaz-shafiq18.workers.dev';
const base=new URL(origin);
if (base.protocol!=='https:') throw new Error('Health checks require HTTPS');

async function get(path) {
  const url=new URL(path,base);
  return fetch(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(12000),
    headers:{'Cache-Control':'no-cache'}});
}

async function runChecks() {
  const response=await get('/api/health');
  if(response.status!==200) throw new Error('Health endpoint returned '+response.status);
  const health=await response.json();
  if(health.status!=='ok'||health.service!=='apex-intake') throw new Error('Unexpected health identity');

  // Until Fatima signs off, deployment must never accept public bookings.
  // Read-only checks and a deliberately empty POST cannot create a booking.
  const configResponse=await get('/api/book/config');
  if(configResponse.status!==200)throw new Error('Booking config returned '+configResponse.status);
  const config=await configResponse.json();
  if(config.enabled!==false||Object.hasOwn(config,'siteKey'))
    throw new Error('Public booking enabled before final owner approval');

  const page=await get('/book');
  if(page.status!==200)throw new Error('Customer booking preview unavailable: '+page.status);
  const bookingHtml=await page.text();
  for(const marker of [
    'Google Maps link or exact pin coordinates',
    'id="transport-pickup"','id="transport-dropoff"',
    'id="transport-none"','id="same-dropoff"'
  ]){
    if(!bookingHtml.includes(marker))
      throw new Error('Customer booking preview missing required release control: '+marker);
  }
  if(bookingHtml.includes('name="transportChoice"'))
    throw new Error('Customer booking preview reverted to obsolete four-way transport radio');

  const blocked=await fetch(new URL('/api/book',base),{
    method:'POST',redirect:'manual',signal:AbortSignal.timeout(12000),
    headers:{'Content-Type':'application/json','Origin':base.origin},
    body:'{}'
  });
  if(blocked.status!==503)throw new Error('Public booking did not fail closed: '+blocked.status);

  const reject=await fetch(new URL('/api/ingest',base),{
    method:'POST',redirect:'manual',signal:AbortSignal.timeout(12000),
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({source:'unauthenticated-monitor'})
  });
  if(reject.status!==401) throw new Error('Unauthenticated intake returned '+reject.status+' (expected 401)');

  // Exercise each private lane, including a forged assertion. These GETs use
  // no record identifiers and cannot approve, issue, retry or send anything.
  for(const path of ['/staff','/staff/api/bookings','/staff/booking',
    '/staff/draft/saved.pdf','/staff/transport','/staff/invoices/',
    '/staff/owner-alerts']) {
    for(const forged of [false,true]) {
      const staff=await fetch(new URL(path,base),{
        method:'GET',redirect:'manual',signal:AbortSignal.timeout(12000),
        headers:{'Cache-Control':'no-cache',
          ...(forged?{'Cf-Access-Jwt-Assertion':'synthetic-invalid-assertion'}:{})}
      });
      // 503 means intentionally unavailable, 403 denied, 30x is Access login.
      if(![301,302,303,307,308,403,503].includes(staff.status)) {
        throw new Error((forged?'Forged-assertion':'Unauthenticated')+
          ' staff route '+path+' returned '+staff.status);
      }
    }
  }

  const staffPreview=await get('/demo/staff');
  if(staffPreview.status!==200)
    throw new Error('/demo/staff returned '+staffPreview.status+' (expected 200)');
  if(!(await staffPreview.text()).includes('SYNTHETIC DEMO'))
    throw new Error('/demo/staff missing its synthetic preview marker');

  // The demo invoice is now a real PDF generated from Fatima's Canva
  // template. Checking for HTML text in its binary bytes is meaningless.
  const invoice=await get('/demo/invoice');
  if(invoice.status!==200)
    throw new Error('/demo/invoice returned '+invoice.status+' (expected 200)');
  if(!invoice.headers.get('content-type')?.toLowerCase().startsWith('application/pdf'))
    throw new Error('/demo/invoice did not return a PDF content type');
  if(!invoice.headers.get('content-disposition')?.toLowerCase().startsWith('inline;'))
    throw new Error('/demo/invoice is not served as an inline preview');
  const bytes=new Uint8Array(await invoice.arrayBuffer());
  if(bytes.length<5000||bytes.length>5_000_000||
     new TextDecoder('ascii').decode(bytes.subarray(0,5))!=='%PDF-'||
     !new TextDecoder('ascii').decode(bytes.subarray(-1024)).includes('%%EOF'))
    throw new Error('/demo/invoice returned an invalid or truncated PDF');
}

let failure;
for(let attempt=1;attempt<=10;attempt++){
  try {
    await runChecks();
    console.log('Cloudflare production checks passed: health, disabled public booking, current preview, intake auth, staff denial, synthetic previews');
    failure=undefined;
    break;
  } catch(error) {
    failure=error;
    console.error('Verification attempt '+attempt+'/10: '+String(error));
    if(attempt<10) await new Promise(resolve=>setTimeout(resolve,12000));
  }
}
if(failure) throw failure;
