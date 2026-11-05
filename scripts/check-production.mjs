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

  const reject=await fetch(new URL('/api/ingest',base),{
    method:'POST',redirect:'manual',signal:AbortSignal.timeout(12000),
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({source:'unauthenticated-monitor'})
  });
  if(reject.status!==401) throw new Error('Unauthenticated intake returned '+reject.status+' (expected 401)');

  // All known staff entrypoints must deny public access, even after
  // newer source-only routes are eventually deployed.
  for(const path of ['/staff','/staff/api/bookings']){
    const response=await get(path);
    // 503: Access not yet activated; 403: Worker denial; 30x: Access login.
    if(![301,302,303,307,308,403,503].includes(response.status)){
      throw new Error('Unauthenticated '+path+' returned '+response.status);
    }
  }
  for(const path of ['/staff/draft','/staff/location']){
    const response=await get(path);
    // 404 is allowed ONLY while this source-only route is not deployed.
    // After deployment, remove 404 to require positive Access enforcement.
    if(![301,302,303,307,308,403,404,503].includes(response.status)){
      throw new Error('Unauthenticated '+path+' returned '+response.status);
    }
  }

  const staffDemo=await get('/demo/staff');
  if(staffDemo.status!==200)throw new Error('/demo/staff returned '+staffDemo.status);
  if(!(await staffDemo.text()).includes('SYNTHETIC DEMO')){
    throw new Error('/demo/staff missing synthetic data label');
  }
  const invoiceDemo=await get('/demo/invoice');
  if(invoiceDemo.status!==200)throw new Error('/demo/invoice returned '+invoiceDemo.status);
  const invoicePage=await invoiceDemo.text();
  // Explicitly require a synthetic and non-payable notice, both before and
  // after the new clean-invoice design. Do not accept only an invoice title.
  if(!invoicePage.includes('SYNTHETIC EXAMPLE')||
     !(invoicePage.includes('NOT FOR CUSTOMER DELIVERY')||
       invoicePage.includes('NOT A PAYABLE INVOICE'))){
    throw new Error('/demo/invoice missing clearly non-payable synthetic label');
  }
}

let failure;
for(let attempt=1;attempt<=10;attempt++){
  try {
    await runChecks();
    console.log('Cloudflare production checks passed: health, intake auth, staff denial, synthetic previews');
    failure=undefined;
    break;
  } catch(error) {
    failure=error;
    console.error('Verification attempt '+attempt+'/10: '+String(error));
    if(attempt<10) await new Promise(resolve=>setTimeout(resolve,12000));
  }
}
if(failure) throw failure;
