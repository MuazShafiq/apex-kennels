/**
 * Public, no-credentials production health check.
 * Does not create bookings or reveal customer records.
 * A red GitHub Actions run is a diagnostic signal, not a paging service.
 */
const origin = process.env.APEX_WORKER_ORIGIN || 'https://apex-kennels-api.muaz-shafiq18.workers.dev';
const base = new URL(origin);
if (base.protocol !== 'https:') throw new Error('HTTPS is required for live checks');

async function check(path, options, expectedStatus) {
  const url = new URL(path, base);
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(12000),
    redirect: 'error',
    headers: {'Cache-Control':'no-cache',...(options?.headers||{})}
  });
  if (response.status !== expectedStatus) {
    throw new Error(path + ' returned HTTP ' + response.status + ', expected ' + expectedStatus);
  }
  return response;
}

const live = await check('/api/health',{method:'GET'},200);
const result = await live.json();
if (result.status !== 'ok' || result.service !== 'apex-intake') {
  throw new Error('Worker health payload did not match expected identity');
}

await check('/api/ingest',{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({source:'invalid-unauthenticated-monitor'})
},401);

const staff = await fetch(new URL('/staff/api/bookings',base),{
  method:'GET',signal:AbortSignal.timeout(12000),redirect:'error'
});
if (staff.status !== 403 && staff.status !== 503) {
  throw new Error('Unauthenticated staff endpoint unexpected status ' + staff.status);
}
console.log('Apex production smoke checks passed: health, intake auth, staff denial');
