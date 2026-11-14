/**
 * Local-only, unauthenticated smoke tests. Never sends a booking or a credential.
 * Intentionally refuses non-loopback origins, including the deployed Worker.
 */
const endpoint = process.env.APEX_LOCAL_ORIGIN || 'http://127.0.0.1:8787';
const origin = new URL(endpoint);
if (origin.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) {
  throw new Error('Local checker only accepts an HTTP loopback address');
}

async function request(path) {
  const url = new URL(path, origin);
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  });
  return response;
}

const health = await request('/api/health');
if (health.status !== 200) throw new Error('/api/health returned '+health.status);
const identity = await health.json();
if (identity.status !== 'ok' || identity.service !== 'apex-intake') {
  throw new Error('Unexpected Apex health identity');
}

const demo = await request('/demo/staff');
if (demo.status !== 200 || !(await demo.text()).includes('SYNTHETIC DEMO')) {
  throw new Error('Staff preview not serving synthetic bookings');
}

const invoice = await request('/demo/invoice');
if (invoice.status !== 200 ||
    !invoice.headers.get('content-type')?.toLowerCase().startsWith('application/pdf') ||
    !invoice.headers.get('content-disposition')?.toLowerCase().startsWith('inline;')) {
  throw new Error('Synthetic invoice PDF preview unavailable');
}
const pdf = new Uint8Array(await invoice.arrayBuffer());
if (pdf.byteLength < 5000 || pdf.byteLength > 5_000_000 ||
    new TextDecoder('ascii').decode(pdf.subarray(0, 5)) !== '%PDF-' ||
    !new TextDecoder('ascii').decode(pdf.subarray(-1024)).includes('%%EOF')) {
  throw new Error('Synthetic invoice PDF is invalid or truncated');
}

const intake = await request('/api/ingest');
if (intake.status !== 405) throw new Error('GET /api/ingest should return 405');

const staff = await request('/staff');
if (![403,503].includes(staff.status)) {
  throw new Error('Local staff route must deny access until configured, got '+staff.status);
}

console.log('Local Apex OK: health, synthetic staff/invoice previews and blocked private routes');
