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
  if(!(await page.text()).includes('Google Maps link or exact pin coordinates'))
    throw new Error('Customer booking preview is not at the latest release');

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

  const staff=await get('/staff/api/bookings');
  // 503 means access is intentionally not activated, 403 denied, 30x is Access login.
  if(![301,302,303,307,308,403,503].includes(staff.status)) {
    throw new Error('Unauthenticated staff route returned '+staff.status);
  }

  for (const [path,marker] of [
    ['/demo/staff','SYNTHETIC DEMO'],
    ['/demo/invoice','NOT A PAYABLE INVOICE']
  ]) {
    const preview=await get(path);
    if(preview.status!==200) throw new Error(path+' returned '+preview.status+' (expected 200)');
    const page=await preview.text();
    if(!page.includes(marker)) throw new Error(path+' missing its synthetic preview marker');
  }
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
