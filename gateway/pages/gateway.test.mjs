import assert from 'node:assert/strict';
import {test} from 'node:test';
import gateway from './site/_worker.js';

const base = 'https://apexkennels.pages.dev';
function mock() {
  const forwarded = [];
  const env = {
    APEX_BACKEND: {
      async fetch(request) {
        forwarded.push(request);
        return new Response('upstream', {status: 200, headers: {
          'X-Robots-Tag': 'noindex, nofollow',
          'Content-Security-Policy': "default-src 'none'; connect-src 'self'",
        }});
      },
    },
  };
  return {env, forwarded};
}

const publicAssets = ['/', '/book', '/book/', '/book/index.html', '/book/app.js',
  '/book/styles.css', '/site/site.css', '/site/inter-tight.woff2', '/book/vendor/maplibre-gl-5.6.1.js'];
for (const path of publicAssets) {
  test('GET ' + path + ' forwards through binding', async () => {
    const {env, forwarded} = mock();
    const response = await gateway.fetch(new Request(base + path), env);
    assert.equal(response.status, 200);
    assert.equal(forwarded.length, 1);
    assert.equal(new URL(forwarded[0].url).pathname, path);
    assert.equal(new URL(forwarded[0].url).origin, base);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  });
}

test('GET config is forwarded without changing public origin', async () => {
  const {env, forwarded} = mock();
  assert.equal((await gateway.fetch(new Request(base + '/api/book/config'), env)).status, 200);
  assert.equal(forwarded[0].url, base + '/api/book/config');
});

for (const path of ['/api/book/location', '/api/book']) {
  test('POST ' + path + ' preserves same-origin JSON body without privileged headers', async () => {
    const {env, forwarded} = mock();
    const response = await gateway.fetch(new Request(base + path, {
      method: 'POST',
      headers: {
        'Origin': base, 'Content-Type': 'application/json',
        'Authorization': 'Bearer forged', 'Cookie': 'session=forged',
        'Cf-Access-Jwt-Assertion': 'forged', 'X-Forwarded-Host': 'staff.example.test',
      },
      body: '{"link":"33.6,73.0"}',
    }), env);
    assert.equal(response.status, 200);
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0].headers.get('Origin'), base);
    for (const h of ['authorization', 'cookie', 'cf-access-jwt-assertion', 'x-forwarded-host']) {
      assert.equal(forwarded[0].headers.get(h), null);
    }
    assert.equal(await forwarded[0].text(), '{"link":"33.6,73.0"}');
  });
}

for (const path of ['/staff', '/staff/booking', '/api/ingest', '/api/health',
  '/api/whatsapp/webhook', '/api/invoice-delivery/webhook', '/demo/staff',
  '/demo/invoice', '/bookish', '/book/%2f..%2fstaff', '/book//staff']) {
  test('restricted path fails closed: ' + path, async () => {
    const {env, forwarded} = mock();
    const response = await gateway.fetch(new Request(base + path), env);
    assert.equal(response.status, 404);
    assert.equal(forwarded.length, 0);
  });
}

for (const [path, method] of [['/', 'POST'], ['/book/app.js', 'POST'],
  ['/api/book/config', 'POST'], ['/api/book/location', 'GET'], ['/api/book', 'GET']]) {
  test('wrong method rejected: ' + method + ' ' + path, async () => {
    const {env, forwarded} = mock();
    const response = await gateway.fetch(new Request(base + path, {method}), env);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Allow'), method === 'GET' ? 'POST' : 'GET');
    assert.equal(forwarded.length, 0);
  });
}

test('missing service binding fails closed', async () => {
  const response = await gateway.fetch(new Request(base + '/'), {});
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
