/**
 * Pre-launch synthetic browser -> Worker smoke. No Neon, customer contacts,
 * Cloudflare credentials or production write endpoints are used.
 * Keeps the real public submission flag disabled in production.
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {handleWorkerRequest} from '../src/cloudflare-worker.ts';
import {confirmExactPin,revealPinFallback,stubMapLibrary,moveSyntheticMap,waitForBrowser} from './gate-picker-browser-fixture.mjs';

const site='http://127.0.0.1';
const env={
  APEX_PUBLIC_BOOKING_ENABLED:'true',
  DATABASE_URL:'postgres://synthetic.invalid/no-writes',
  TURNSTILE_SITE_KEY:'ci-synthetic-sitekey',
  TURNSTILE_SECRET_KEY:'ci-synthetic-secret'
};
const saved=[];
// Static assets still pass through the Worker so the browser enforces the
// deployed Content-Security-Policy, including the CSP map-worker build.
env.ASSETS={async fetch(request){
  const path=new URL(request.url).pathname;
  const root=resolve(process.cwd(),'public','book');
  const dest=resolve(root,path.slice('/book/'.length));
  if(!path.startsWith('/book/')||!dest.startsWith(root+sep))return new Response(null,{status:404});
  try{
    const bytes=await readFile(dest);
    const type=path.endsWith('.css')?'text/css':path.endsWith('.js')?'application/javascript':
      path.endsWith('.svg')?'image/svg+xml':'text/html';
    return new Response(bytes,{headers:{'Content-Type':type}});
  }catch{return new Response(null,{status:404});}
}};
let challengeChecks=0;
const persist=async(db,booking)=>{
  assert.equal(db,env.DATABASE_URL);
  assert.equal(booking.source,'website');
  assert(booking.customerName.startsWith('APEX CANARY'));
  assert(booking.petName.startsWith('APEX SYNTHETIC CANARY'));
  saved.push(booking);
  return {bookingId:'a123e456-789b-4123-a456-426614174001',
    created:true,status:'requested'};
};
const verifyChallenge=async(token,secret,hostname)=>{
  challengeChecks++;
  assert.equal(token,'ci-synthetic-token');
  assert.equal(secret,env.TURNSTILE_SECRET_KEY);
  assert.equal(hostname,'127.0.0.1');
  return true;
};
let port;
const server=createServer(async(req,res)=>{
  const path=new URL(req.url??'/',site).pathname;
  if(path.startsWith('/api/')){
    const bytes=[];
    for await(const chunk of req)bytes.push(chunk);
    const request=new Request(site+':'+port+(req.url??'/'),{
      method:req.method,headers:{
        Origin:req.headers.origin??site+':'+port,
        'Content-Type':req.headers['content-type']??'application/json'
      },
      ...(req.method==='POST'?{body:Buffer.concat(bytes)}:{})
    });
    const answer=await handleWorkerRequest(request,env,persist,{verifyChallenge});
    res.writeHead(answer.status,Object.fromEntries(answer.headers.entries()));
    res.end(Buffer.from(await answer.arrayBuffer()));
    return;
  }
  const answer=await handleWorkerRequest(new Request(site+':'+port+(req.url??'/')),env,persist,{verifyChallenge});
  res.writeHead(answer.status,Object.fromEntries(answer.headers.entries()));
  res.end(Buffer.from(await answer.arrayBuffer()));
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
port=server.address().port;
const origin=site+':'+port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const choice=async(page,name,value)=>{
  await page.locator('label.option:has(input[name="'+name+'"][value="'+value+'"]) > span').click();
};
const fill=async page=>{
  await page.locator('[name="customerName"]').fill('APEX CANARY BROWSER TEST');
  await page.locator('[name="phone"]').fill('03000000000');
  await page.locator('[name="ownerAddress"]').fill('Synthetic gate, not a customer address');
  await page.locator('[name="startDate"]').fill('2026-12-10');
  await page.locator('[name="endDate"]').fill('2026-12-12');
  await page.locator('[name="emergencyContactPhone"]').fill('03000000001');
  await page.locator('[name="petName"]').fill('APEX SYNTHETIC CANARY DOG');
  await page.locator('[name="breed"]').fill('Synthetic mixed breed');
  await page.locator('[name="gender"]').fill('Female');
  await page.locator('[name="age"]').fill('2 years');
  await page.locator('[name="vaccinationStatus"]').selectOption('Fully vaccinated and booster is up to date');
  await choice(page,'distemperHistory','No');
  await choice(page,'cameraCageRequested','no');
  for(const key of ['friendly','fears','climber','foodSensitivities',
    'barksExcessively','allergies','biteHistory','medicalConditions'])
    await choice(page,'trait_'+key,'No');
  await page.locator('[name="termsAccepted"]').check();
};
const newPage=async({map='synthetic',viewport={width:390,height:844}}={})=>{
  const page=await browser.newPage({viewport,hasTouch:true});
  if(map==='synthetic')await stubMapLibrary(page);
  await page.addInitScript(()=>{
    // This is an isolated CI stub. No real Turnstile bypass is deployed.
    window.turnstile={
      render(_target,opts){
        if(opts.action!=='apex-booking')throw Error('Wrong Turnstile action');
        queueMicrotask(()=>opts.callback('ci-synthetic-token'));
        return 1;
      },
      reset(){}
    };
  });
  await page.route('https://challenges.cloudflare.com/**',route=>
    route.fulfill({status:200,contentType:'application/javascript',body:'// CI stub only'}));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/book',{waitUntil:'domcontentloaded'});
  await page.locator('#preview').waitFor({state:'hidden'});
  await page.locator('#submit').waitFor({state:'visible'});
  assert.equal(await page.locator('#submit').isEnabled(),true);
  return {page,errors};
};
try{
  // Both selected: reuse the pickup gate unless the customer explicitly
  // requests a different drop-off location.
  const first=await newPage();
  await fill(first.page);
  await first.page.locator('#transport-pickup').check();
  await first.page.locator('#transport-dropoff').check();
  assert.equal(await first.page.locator('#same-dropoff').isChecked(),true);
  assert.equal(await first.page.locator('#dropoff-location').isVisible(),false);
  await first.page.locator('#submit').click();
  await first.page.locator('#message').waitFor({state:'visible'});
  assert.match(await first.page.locator('#message').innerText(),/pickup (?:location|vehicle gate)/i);
  assert.equal(saved.length,0);
  await confirmExactPin(first.page,'33.700000, 73.080000');
  await first.page.locator('[name="whatsappInvoiceOptIn"]').check();
  await first.page.locator('#submit').click();
  await first.page.locator('#complete').waitFor({state:'visible'});
  assert.equal(saved.length,1);
  assert.deepEqual(saved[0].transportLocation,{
    latitude:33.7,longitude:73.08,service:'both',customerConfirmed:true});
  assert.equal(saved[0].transportDropoffLocation,undefined);
  assert.equal(saved[0].details.whatsappInvoiceOptIn,true);
  assert.equal(Object.keys(saved[0].details.personalityTraits).length,8);
  assert.deepEqual(first.errors,[]);
  await first.page.close();

  // None is an explicit choice, exclusive with other services; an unanswered
  // transport question must not silently be interpreted as None.
  const second=await newPage();
  await fill(second.page);
  await second.page.locator('#submit').click();
  await second.page.locator('#message').waitFor({state:'visible'});
  assert.match(await second.page.locator('#message').innerText(),/pickup, drop-off, or no transport/i);
  assert.equal(saved.length,1);
  await second.page.locator('#transport-none').check();
  await second.page.locator('#submit').click();
  await second.page.locator('#complete').waitFor({state:'visible'});
  assert.equal(saved.length,2);
  assert.equal(saved[1].transportLocation,undefined);
  assert.equal(saved[1].details.pickupDropoffRequested,false);
  assert.deepEqual(second.errors,[]);
  await second.page.close();

  // Both with genuinely different gates must require and preserve two
  // independent Maps pins, not silently duplicate the first one.
  const third=await newPage();
  await fill(third.page);
  await third.page.locator('#transport-pickup').check();
  await third.page.locator('#transport-dropoff').check();
  await confirmExactPin(third.page,'33.700000, 73.080000');
  await third.page.locator('#same-dropoff').uncheck();
  assert.equal(await third.page.locator('#dropoff-location').isVisible(),true);
  await third.page.locator('#submit').click();
  await third.page.locator('#message').waitFor({state:'visible'});
  assert.match(await third.page.locator('#message').innerText(),/separate drop-off (?:location|vehicle gate)/i);
  assert.equal(saved.length,2);
  await confirmExactPin(third.page,'33.580000, 73.020000','dropoff-');
  await third.page.locator('#submit').click();
  await third.page.locator('#complete').waitFor({state:'visible'});
  assert.equal(saved.length,3);
  assert.deepEqual(saved[2].transportLocation,{
    latitude:33.7,longitude:73.08,service:'both',customerConfirmed:true});
  assert.deepEqual(saved[2].transportDropoffLocation,{
    latitude:33.58,longitude:73.02,customerConfirmed:true});
  assert.deepEqual(third.errors,[]);
  await third.page.close();

  // Pickup can stand alone.
  const fourth=await newPage();
  await fill(fourth.page);
  await fourth.page.locator('#transport-pickup').check();
  assert.equal(await fourth.page.locator('#pickup-location').isVisible(),true);
  assert.equal(await fourth.page.locator('#dropoff-location').isVisible(),false);
  await confirmExactPin(fourth.page,'33.700000, 73.080000');
  await fourth.page.locator('#submit').click();
  await fourth.page.locator('#complete').waitFor({state:'visible'});
  assert.equal(saved.length,4);
  assert.equal(saved[3].transportLocation.service,'pickup');
  assert.equal(saved[3].transportDropoffLocation,undefined);
  await fourth.page.close();

  // Drop-off can stand alone and must use its own pin, not the hidden pickup
  // field that used to serve both roles.
  const fifth=await newPage();
  await fill(fifth.page);
  await fifth.page.locator('#transport-dropoff').check();
  assert.equal(await fifth.page.locator('#pickup-location').isVisible(),false);
  assert.equal(await fifth.page.locator('#dropoff-location').isVisible(),true);
  await confirmExactPin(fifth.page,'33.580000, 73.020000','dropoff-');
  await fifth.page.locator('#submit').click();
  await fifth.page.locator('#complete').waitFor({state:'visible'});
  assert.equal(saved.length,5);
  assert.deepEqual(saved[4].transportLocation,{
    latitude:33.58,longitude:73.02,service:'dropoff',customerConfirmed:true});
  assert.equal(saved[4].transportDropoffLocation,undefined);
  await fifth.page.close();

  // No transport and a selected service must remain mutually exclusive.
  const sixth=await newPage();
  await sixth.page.locator('#transport-none').check();
  await sixth.page.locator('#transport-dropoff').check();
  assert.equal(await sixth.page.locator('#transport-none').isChecked(),false);
  await sixth.page.locator('#transport-none').check();
  assert.equal(await sixth.page.locator('#transport-pickup').isChecked(),false);
  assert.equal(await sixth.page.locator('#transport-dropoff').isChecked(),false);
  await sixth.page.close();

  assert.equal(challengeChecks,5);
  // The map centre is only a candidate until explicit confirmation. Moving
  // it after reopening invalidates the saved pin before another submission.
  const mapped=await newPage();
  await fill(mapped.page);
  await mapped.page.locator('#transport-pickup').check();
  await mapped.page.locator('#choose-map').click();
  await mapped.page.locator('#map-confirm').waitFor({state:'visible'});
  await waitForBrowser(mapped.page,()=>window.__syntheticMaps?.length>0);
  await mapped.page.evaluate(()=>window.__syntheticMaps.at(-1).panTo([73.081,33.701]));
  assert.equal(await mapped.page.locator('#map-confirm').isDisabled(),true,'City-scale map is not an exact gate');
  assert.equal(await mapped.page.locator('#confirm-gate').isVisible(),false,'Map precision must not be bypassable with fallback confirmation');
  await moveSyntheticMap(mapped.page,33.701,73.081);
  await mapped.page.locator('#map-confirm').click();
  await mapped.page.locator('#selected-location-link').waitFor({state:'visible'});
  await mapped.page.locator('#choose-map').click();
  await moveSyntheticMap(mapped.page,33.702,73.082);
  await mapped.page.locator('#map-close').click();
  await mapped.page.locator('#submit').click();
  assert.equal(saved.length,5,'An unconfirmed moved map must never reach persistence');
  assert.match(await mapped.page.locator('#message').innerText(),/pickup (?:location|vehicle gate)/i);
  await mapped.page.locator('#choose-map').click();
  await mapped.page.locator('#map-confirm').click();
  await mapped.page.locator('#transport-dropoff').check();
  await mapped.page.locator('#same-dropoff').uncheck();
  await mapped.page.locator('#dropoff-choose-map').click();
  await moveSyntheticMap(mapped.page,33.58,73.02);
  await mapped.page.locator('#map-confirm').click();
  await mapped.page.locator('#submit').click();
  await mapped.page.locator('#complete').waitFor({state:'visible'});
  assert.equal(saved.length,6);
  assert.deepEqual(saved[5].transportLocation,{latitude:33.702,longitude:73.082,service:'both',customerConfirmed:true});
  assert.deepEqual(saved[5].transportDropoffLocation,{latitude:33.58,longitude:73.02,customerConfirmed:true});
  assert.deepEqual(mapped.errors,[]);
  await mapped.page.close();

  // Exact Google coordinates are valid candidates; viewport centres and
  // ambiguous shared links never become a substitute for an exact gate.
  const fallback=await newPage();
  await fill(fallback.page);
  await fallback.page.locator('#transport-pickup').check();
  await revealPinFallback(fallback.page);
  await fallback.page.locator('#maps-link').fill('https://www.google.com/maps/search/?api=1&query=33.7%2C73.08');
  await fallback.page.locator('#confirm-gate').waitFor({state:'visible'});
  await fallback.page.locator('#map-fallback').click();
  await fallback.page.locator('#submit').click();
  assert.equal(saved.length,6,'Exact pasted pin still requires explicit gate confirmation');
  await fallback.page.locator('#confirm-gate').click();
  await fallback.page.locator('#maps-link').fill('https://www.google.com/maps/@33.7,73.08,16z');
  await waitForBrowser(fallback.page,()=>/exact gate pin/.test(document.querySelector('#coordinate-status').textContent));
  assert.equal(await fallback.page.locator('#selected-location-link').isVisible(),false);
  assert.equal(await fallback.page.locator('#confirm-gate').isVisible(),false);
  await fallback.page.locator('#submit').click();
  assert.equal(saved.length,6);
  await fallback.page.locator('#maps-link').fill('31.5, 74.3');
  await waitForBrowser(fallback.page,()=>/Islamabad|Rawalpindi|service area/.test(document.querySelector('#coordinate-status').textContent));
  assert.equal(await fallback.page.locator('#confirm-gate').isVisible(),false);
  await fallback.page.evaluate(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(_ok,fail){fail({code:1});}}}));
  await fallback.page.locator('#locate').click();
  assert.match(await fallback.page.locator('#coordinate-status').innerText(),/permission was not granted/i);
  await confirmExactPin(fallback.page,'33.7, 73.08');
  await fallback.page.locator('#submit').click();
  await fallback.page.locator('#complete').waitFor({state:'visible'});
  assert.equal(saved.length,7);
  assert.deepEqual(fallback.errors,[]);
  await fallback.page.close();

  // Delayed device/provider results cannot reopen a hidden service's map or
  // restore its gate after the customer changes the transport choice.
  const delayed=await newPage();
  await delayed.page.evaluate(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
    getCurrentPosition(ok){window.__completeSyntheticGps=()=>ok({coords:{latitude:33.7,longitude:73.08}});}
  }}));
  await delayed.page.locator('#transport-pickup').check();
  await delayed.page.locator('#locate').click();
  await delayed.page.locator('#transport-none').check();
  await delayed.page.evaluate(()=>window.__completeSyntheticGps());
  await delayed.page.waitForTimeout(100);
  assert.equal(await delayed.page.locator('#gate-picker').isVisible(),false,'Late GPS reopened hidden pickup');
  assert.equal(await delayed.page.locator('#selected-location-link').isVisible(),false);
  let releaseLink,linkStarted;
  const linkRequest=new Promise(resolve=>{linkStarted=resolve;});
  await delayed.page.route('**/api/book/location',async route=>{
    linkStarted();await new Promise(resolve=>{releaseLink=resolve;});
    await route.fulfill({json:{latitude:33.58,longitude:73.02}});
  });
  await delayed.page.locator('#transport-pickup').check();
  await delayed.page.locator('#transport-dropoff').check();
  await delayed.page.locator('#same-dropoff').uncheck();
  await delayed.page.locator('#dropoff-maps-link').fill('https://maps.app.goo.gl/synthetic-held-response');
  await linkRequest;
  await delayed.page.locator('#same-dropoff').check();
  releaseLink();
  await delayed.page.waitForTimeout(100);
  assert.equal(await delayed.page.locator('#gate-picker').isVisible(),false,'Late resolver reopened reused drop-off');
  assert.equal(await delayed.page.locator('#dropoff-selected-location-link').isVisible(),false);
  await delayed.page.locator('#same-dropoff').uncheck();
  await delayed.page.locator('#locate').click();
  await delayed.page.locator('#dropoff-choose-map').click();
  assert.match(await delayed.page.locator('#gate-picker-title').innerText(),/drop-off/);
  await delayed.page.evaluate(()=>window.__completeSyntheticGps());
  await delayed.page.waitForTimeout(100);
  assert.match(await delayed.page.locator('#gate-picker-title').innerText(),/drop-off/,'Late pickup GPS stole the active drop-off map');
  await delayed.page.locator('#map-close').click();
  assert.deepEqual(delayed.errors,[]);
  await delayed.page.close();

  // Map loading failure leaves an independently usable exact-pin path.
  const failed=await newPage({map:'failed'});
  await failed.page.route('**/*maplibre*.js',route=>route.abort());
  await failed.page.locator('#transport-pickup').check();
  await failed.page.locator('#choose-map').click();
  await failed.page.locator('#map-status').filter({hasText:'could not load'}).waitFor();
  assert.equal(await failed.page.locator('#map-confirm').isDisabled(),true);
  await failed.page.locator('#map-fallback').click();
  await confirmExactPin(failed.page,'33.7, 73.08');
  await failed.page.close();

  // Every default run loads the actual pinned MapLibre library and CSP
  // worker, with a tiny network-independent style. Live tiles are opt-in so
  // CI failure cannot be confused with a provider/ISP availability result.
  const liveTiles=process.env.APEX_REAL_MAP_CHECK==='1';
  const actual=await newPage({map:'real',viewport:{width:1280,height:900}});
  const basemapResponses=[];
  actual.page.on('response',response=>{
    if(response.url().startsWith('https://tiles.openfreemap.org/'))
      basemapResponses.push({url:response.url(),status:response.status()});
  });
  const cspViolations=[];
  await actual.page.evaluate(()=>{
    window.__cspViolations=[];
    document.addEventListener('securitypolicyviolation',event=>window.__cspViolations.push(event.violatedDirective+': '+event.blockedURI));
  });
  if(!liveTiles)await actual.page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#dbe5dd'}}]}}));
  await actual.page.locator('#transport-pickup').check();
  const response=await actual.page.request.get(origin+'/book');
  assert.match(response.headers()['content-security-policy'],/worker-src 'self'/);
  await actual.page.locator('#choose-map').click();
  await actual.page.locator('#map-canvas canvas').waitFor({state:'visible'});
  await waitForBrowser(actual.page,()=>document.querySelector('#map-loading')?.hidden===true,45000);
  assert.equal(await actual.page.evaluate(()=>typeof window.maplibregl?.Map),'function');
  assert.equal(await actual.page.evaluate(()=>window.__syntheticMaps),undefined);
  const canvas=actual.page.locator('#map-canvas canvas');
  assert((await canvas.boundingBox()).width>300,'Actual map canvas must have usable width');
  await canvas.focus();
  for(let step=0;step<6;step++){
    await canvas.press('+');
    await actual.page.waitForTimeout(350);
  }
  await canvas.press('ArrowRight');
  await actual.page.waitForTimeout(400);
  if(liveTiles){
    assert(basemapResponses.some(item=>item.url.includes('/styles/liberty')&&item.status===200),'Live style did not load');
    assert(basemapResponses.some(item=>/\.pbf(?:\?|$)/.test(item.url)&&item.status===200),'No live vector map tile loaded');
    assert(basemapResponses.every(item=>item.status<400),'Live basemap resource failed: '+JSON.stringify(basemapResponses.filter(item=>item.status>=400)));
    await actual.page.screenshot({path:'mobile-real-openfreemap-picker.png',fullPage:true});
  }
  await actual.page.locator('#map-confirm').click();
  await actual.page.locator('#selected-location-link').waitFor({state:'visible'});
  assert.match(await actual.page.locator('#selected-location-link').getAttribute('href'),/query=/);
  cspViolations.push(...await actual.page.evaluate(()=>window.__cspViolations));
  assert.deepEqual(cspViolations,[],'Actual Worker CSP must allow the real map and local worker');
  assert.deepEqual(actual.errors,[]);
  console.log(liveTiles?'Real MapLibre / local CSP worker / live OpenFreeMap rendered and keyboard-selected a gate.':'Real MapLibre / local CSP worker rendered with a synthetic style (provider network untested).');
  await actual.page.close();
  console.log('Synthetic browser-to-Worker booking passed: explicit None, pickup only, drop-off only, Both same gate and Both different gates, map invalidation, exact-pin confirmation, service bounds, denied GPS and map-load fallback; no real writes/messages.');
} finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
