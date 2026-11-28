/** Loopback-only Studio proof. Synthetic identity/rate reads/audit, real local PNG renderer. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {handleStaffStudio} from '../src/staff-studio.ts';

let current = {version: 3, std: 2500, cam: 3000, pkgDisc: 10000};
let unavailable = false;
const audits = [];
const assetRoot = resolve('public');
const env = {DATABASE_URL: 'synthetic-no-database', ASSETS: {async fetch(request) {
  const path = new URL(request.url).pathname;
  const filename = resolve(assetRoot, path.slice(1));
  if (!filename.startsWith(assetRoot + sep)) return new Response(null, {status: 404});
  try {
    const bytes = await readFile(filename);
    const type = path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css'
      : path.endsWith('.woff2') ? 'font/woff2' : path.endsWith('.svg') ? 'image/svg+xml'
      : path.endsWith('.webp') ? 'image/webp' : 'image/png';
    return new Response(bytes, {headers: {'Content-Type': type}});
  } catch { return new Response(null, {status: 404}); }
}}};
const deps = {rates: async () => unavailable ? null : current, record: async (_url, actor, meta) => {
  assert.equal(actor, 'synthetic@example.test'); audits.push(meta); return true;
}};
const server = createServer(async (req, res) => {
  try {
    const parts = [];
    for await (const part of req) parts.push(part);
    const request = new Request(`http://127.0.0.1:${server.address().port}${req.url}`, {
      method: req.method, headers: req.headers,
      ...(!['GET', 'HEAD'].includes(req.method) ? {body: Buffer.concat(parts)} : {}),
    });
    let response;
    if (req.url === '/fixture') {
      response = new Response(`<!doctype html><link rel="stylesheet" href="/staff/studio/src/studio.css"><div id="root"></div><script type="module">
        import {mountStudio} from '/staff/studio/src/studio.js';
        window.exports=[];window.studio=mountStudio(document.getElementById('root'), {embedded:true,
          assetBase:'/staff/studio/assets/',rates:{version:3,std:2500,cam:3000,pkgDisc:10000},
          onExport:e=>window.exports.push(e.meta)});
      </script>`, {headers: {'Content-Type': 'text/html'}});
    } else response = req.url.startsWith('/site/') ? await env.ASSETS.fetch(request)
      : await handleStaffStudio(request, env, {email: 'synthetic@example.test'}, deps);
    response ??= new Response(null, {status: 404});
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) { res.writeHead(500); res.end('Fixture failed'); console.error(err); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless: true});
const waitFor = async (page, predicate) => {
  for (let n = 0; n < 150; n++) { if (await page.evaluate(predicate)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('Browser condition timed out');
};
try {
  const context = await browser.newContext({viewport: {width: 390, height: 844}, acceptDownloads: true});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const foreign = [];
  page.on('request', request => { if (!request.url().startsWith(origin) && !request.url().startsWith('blob:') && !request.url().startsWith('data:')) foreign.push(request.url()); });
  await page.goto(origin + '/staff/studio');
  await page.getByText('Fact prices from rate card v3').waitFor();
  assert.equal(await page.locator('h1').evaluate(el => el === document.activeElement), true);
  await page.getByRole('button', {name: 'Fact Prices', exact: true}).click();
  await waitFor(page, () => document.querySelector('.sls-post').textContent.includes('2,500'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Download PNG', exact: true}).click();
  const download = await downloadPromise;
  const bytes = await readFile(await download.path());
  assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), 1080); assert.equal(bytes.readUInt32BE(20), 1350);
  await page.getByText('Export recorded.', {exact: true}).waitFor();
  assert.equal(audits[0].rateCard, 3);
  assert.equal('dog' in audits[0], false);
  current = {version: 4, std: 2700, cam: 3200, pkgDisc: 10000};
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByText('Fact prices from rate card v4').waitFor();
  await waitFor(page, () => document.querySelector('.sls-post').textContent.includes('2,700'));
  assert.equal(await page.getByRole('button', {name: 'View file', exact: true}).isVisible(), false);
  // A rate change immediately before pressing Download is read without waiting for the poll.
  current = {version: 5, std: 2900, cam: 3400, pkgDisc: 10000};
  const boundaryDownload = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Download PNG', exact: true}).click();
  await boundaryDownload;
  await waitFor(page, () => document.querySelector('.sls-post').textContent.includes('2,900'));
  await page.getByText('Export recorded.', {exact: true}).waitFor();
  assert.equal(audits.at(-1).rateCard, 5);
  unavailable = true;
  await page.getByRole('button', {name: 'Download PNG', exact: true}).click();
  await page.getByText('Current prices are unavailable. Studio is paused. Reconnect to continue.', {exact: true}).waitFor();
  assert.equal(await page.getByRole('button', {name: 'Download PNG', exact: true}).isDisabled(), true);
  unavailable = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await waitFor(page, () => !document.querySelector('.sls-dl').disabled);

  // Exercise the module's real renderer with a new rate held during its PNG work.
  await page.goto(origin + '/fixture');
  await page.getByRole('button', {name: 'Fact Prices', exact: true}).click();
  await page.addScriptTag({url: origin + '/staff/studio/src/vendor/html-to-image.js'});
  await page.evaluate(() => {
    const real = window.htmlToImage.toBlob;
    let first = true;
    window.htmlToImage.toBlob = async (...args) => {
      if (first) {
        first = false;
        window.renderStarted = true;
        await new Promise(resolve => window.releaseRender = resolve);
      }
      return real(...args);
    };
  });
  const raceDownload = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Download PNG', exact: true}).click();
  await waitFor(page, () => window.renderStarted);
  await page.evaluate(() => window.studio.setRates({version: 4, std: 2700, cam: 3200, pkgDisc: 10000}));
  await waitFor(page, () => document.querySelector('.sls-post').textContent.includes('2,500'));
  assert.equal(await page.locator('.sls-controls').evaluate(el => el.inert), true);
  await page.evaluate(() => window.releaseRender());
  const raceFile = await raceDownload;
  assert.ok((await readFile(await raceFile.path())).byteLength > 10000);
  await waitFor(page, () => window.exports.length === 1 && window.studio.getState().rates.version === 4);
  assert.equal(await page.evaluate(() => window.exports[0].rateCard), 3);
  assert.equal(await page.evaluate(() => window.studio.getState().outUrl), '');
  assert.equal(await page.getByRole('button', {name: 'View file', exact: true}).isVisible(), false);
  assert.deepEqual(errors, []); assert.deepEqual(foreign, []);
  console.log('PASS Studio mobile mount, local PNG dimensions, private audit, live rates and mid-export snapshot consistency (synthetic auth/DB).');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
