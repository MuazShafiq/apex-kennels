import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleStaffStudio, sanitizeStudioAudit} from './staff-studio.ts';

const fact = {rateCard: 3, kind: 'fact', format: 'feed', width: 1080, height: 1350,
  colourway: 'Powder + Coral', material: 'Cut', paw: 'none', consent: null, verified: null};
const rates = {version: 3, std: 2500, cam: 3000, pkgDisc: 10000};
const actor = {email: 'synthetic-staff@example.test'};
const env = {DATABASE_URL: 'synthetic-db'};
const deps = {rates: async () => rates, record: async () => true};
const post = (body: unknown, headers: Record<string, string> = {}) => new Request('https://staff.example.test/staff/studio/audit', {
  method: 'POST', headers: {Origin: 'https://staff.example.test', 'Content-Type': 'application/json',
    'X-Apex-Studio': 'export', ...headers}, body: JSON.stringify(body),
});

test('Studio audit retains export facts and excludes all identifying client metadata', () => {
  assert.deepEqual(sanitizeStudioAudit({...fact, dog: 'synthetic dog', day: 'Day 01', user: {id: 'forged'},
    at: '2099-01-01', photo: 'private', fileName: 'dog-name.png'}), fact);
  const photo = {...fact, kind: 'gate', rateCard: null, consent: true, verified: true};
  assert.deepEqual(sanitizeStudioAudit(photo), photo);
  for (const patch of [{consent: false}, {verified: null}, {rateCard: 3}, {width: 1}, {height: 1920}, {format: 'unknown'}]) {
    assert.equal(sanitizeStudioAudit({...photo, ...patch}), null);
  }
  for (const patch of [{rateCard: null}, {rateCard: -1}, {rateCard: '3'}, {consent: true}, {format: 'reel', height: 1920}]) {
    assert.equal(sanitizeStudioAudit({...fact, ...patch}), null);
  }
});

test('Studio bootstrap uses effective rates and fails closed without a published card', async () => {
  const request = new Request('https://staff.example.test/staff/studio/bootstrap');
  const response = await handleStaffStudio(request, env, actor, deps);
  assert.deepEqual(await response!.json(), {rates});
  assert.match(response!.headers.get('cache-control')!, /no-store/);
  assert.equal((await handleStaffStudio(request, env, actor, {...deps, rates: async () => null}))!.status, 503);
  assert.equal((await handleStaffStudio(request, env, {email: ''}, deps))!.status, 403);
});

test('Studio export audit enforces same origin, JSON and bounded body before persistence', async () => {
  let writes = 0;
  const db = {...deps, record: async (_url: string, who: string, meta: object) => {
    writes++;
    assert.equal(who, actor.email);
    assert.deepEqual(meta, fact);
    return true;
  }};
  assert.equal((await handleStaffStudio(post({...fact, user: 'forged'}), env, actor, db))!.status, 200);
  for (const headers of [{Origin: 'https://foreign.example'}, {'Sec-Fetch-Site': 'cross-site'},
    {'X-Apex-Studio': ''}] as Record<string, string>[]) {
    assert.equal((await handleStaffStudio(post(fact, headers), env, actor, db))!.status, 403);
  }
  assert.equal((await handleStaffStudio(post(fact, {'Content-Type': 'text/plain'}), env, actor, db))!.status, 415);
  assert.equal((await handleStaffStudio(post({...fact, extra: 'a'.repeat(5000)}), env, actor, db))!.status, 422);
  assert.equal(writes, 1);
  assert.equal((await handleStaffStudio(post(fact), env, actor, {...deps, record: async () => false}))!.status, 409);
});

test('Studio shell permits browser-local exports with no inline scripts and assets stay private', async () => {
  const response = await handleStaffStudio(new Request('https://staff.example.test/staff/studio'), env, actor, deps);
  const html = await response!.text();
  assert.match(html, /Stay Log Studio/);
  assert.match(html, /type="module" src="\/staff\/studio\/host.js"/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(response!.headers.get('content-security-policy')!, /script-src 'self'/);
  assert.match(response!.headers.get('content-security-policy')!, /img-src 'self' blob: data:/);
  let fetched = '';
  const assets = {...env, ASSETS: {fetch: async (request: Request) => { fetched = request.url; return new Response('asset'); }}};
  const asset = await handleStaffStudio(new Request('https://staff.example.test/staff/studio/src/studio.js'), assets, actor, deps);
  assert.equal(asset!.status, 200);
  assert.match(asset!.headers.get('cache-control')!, /private, no-store/);
  assert.ok(fetched.endsWith('/src/studio.js'));
  fetched = '';
  assert.equal((await handleStaffStudio(new Request('https://staff.example.test/staff/studio/index.html'), assets, actor, deps))!.status, 404);
  assert.equal(fetched, '');
});
