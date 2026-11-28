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
import {confirmExactPin,revealPinFallback,stubMapLibrary,moveSyntheticMap,waitForBrowser,fillBookingThroughDog,fillBookingCareAndContact,futureBookingDate} from './gate-picker-browser-fixture.mjs';

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
  const root=resolve(process.cwd(),'public');
  const dest=resolve(root,path.slice(1));
  if((!path.startsWith('/book/')&&!path.startsWith('/site/'))||!dest.startsWith(root+sep))return new Response(null,{status:404});
  try{
    const bytes=await readFile(dest);
    const type=path.endsWith('.css')?'text/css':path.endsWith('.js')?'application/javascript':
      path.endsWith('.svg')?'image/svg+xml':path.endsWith('.woff2')?'font/woff2':
      path.endsWith('.webp')?'image/webp':path.endsWith('.png')?'image/png':'text/html';
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
async function submitRequest(page){
  await fillBookingCareAndContact(page);
  await page.locator('#submit').click();
}
const syntheticRates={version:1,effectiveFrom:'2026-01-01T00:00:00Z',stdDaily:2500,cameraDaily:3000,packageDays:30,packageDiscount:10000};
const newPage=async({map='synthetic',viewport={width:390,height:844},atTransport=true,rates=syntheticRates}={})=>{
  const page=await browser.newPage({viewport,hasTouch:true});
  await page.route('**/api/rate-card/current',route=>route.fulfill({status:rates?200:503,contentType:'application/json',body:JSON.stringify(rates??{error:'Unavailable'})}));
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
  await page.locator('#preview').waitFor({state:'attached'});
  await waitForBrowser(page,()=>document.querySelector('#submit')?.disabled===false);
  if(atTransport)await fillBookingThroughDog(page);
  return {page,errors};
};
try{
  // An effective card supplies every customer price. An outage never blocks
  // the request, and malformed/future cards never become fallback prices.
  const changed=await newPage({atTransport:false,rates:{...syntheticRates,version:2,stdDaily:2700,cameraDaily:3200}});
  await fillBookingThroughDog(changed.page);
  assert.equal(await changed.page.locator('[data-tk-tot]').textContent(),'Rs 8,100');
  assert.equal(await changed.page.locator('[data-booking-rate="no"]').textContent(),'Rs 2,700 a day');
  await changed.page.locator('[data-step-h="1"]').click();
  await changed.page.locator('[name="endDate"]').fill(futureBookingDate(39));
  assert.equal(await changed.page.locator('[data-tk-tot]').textContent(),'Rs 81,000');
  assert.equal(await changed.page.locator('[data-package-copy]').first().textContent(),'30-day package: Rs 71,000 if confirmed by staff.');
  await changed.page.close();
  for(const unavailable of [null,{...syntheticRates,packageDiscount:'10000'},{...syntheticRates,effectiveFrom:'2999-01-01T00:00:00Z'}]){
    const fallback=await newPage({rates:unavailable,viewport:{width:320,height:568}});
    assert.equal(await fallback.page.locator('[data-tk-tot]').textContent(),'To be confirmed');
    assert.equal(await fallback.page.locator('[data-tk-pkg]').isHidden(),true);
    await fallback.page.locator('[data-sum-open]').click();
    const summarySize=await fallback.page.locator('#mobile-summary').boundingBox();
    assert.equal(summarySize.height,568);
    assert.equal(summarySize.width,320);
    assert(await fallback.page.locator('#mobile-summary').evaluate(el=>el.scrollWidth<=el.clientWidth),'Unavailable rate must fit small summary');
    await fallback.page.locator('[data-sum-close]').click();
    await fallback.page.locator('#transport-none').check();
    await submitRequest(fallback.page);
    await fallback.page.locator('#complete').waitFor({state:'visible'});
    assert.equal(await fallback.page.locator('[data-d-r4]').textContent(),'To be confirmed');
    assert.equal(await fallback.page.locator('.bk-seal').getAttribute('aria-hidden'),'true');
    assert.equal(await fallback.page.locator('[data-d-days]').textContent(),'3 billed days');
    assert(await fallback.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Confirmation must fit small phone');
    if(unavailable===null)await fallback.page.screenshot({path:'mobile-booking-confirmation-small.png',fullPage:true});
    await fallback.page.close();
  }
  saved.length=0;
  challengeChecks=0;
  // Both selected: reuse the pickup gate unless the customer explicitly
  // requests a different drop-off location.
  const first=await newPage({atTransport:false});
  await first.page.locator('[data-next="1"]').click();
  assert.equal(await first.page.locator('#bk-start').getAttribute('aria-invalid'),'true');
  assert.equal(await first.page.locator('[data-step-h="2"]').isDisabled(),true);
  await fillBookingThroughDog(first.page);
  await first.page.locator('[data-step-h="1"]').click();
  assert.equal(await first.page.locator('[data-tk-tot]').textContent(),'Rs 7,500');
  await first.page.locator('[name="endDate"]').fill(futureBookingDate(39));
  assert.equal(await first.page.locator('[data-tk-tot]').textContent(),'Rs 75,000');
  const packageCopy='30-day package: Rs 65,000 if confirmed by staff.';
  assert.equal(await first.page.locator('[data-tk-pkg] [data-package-copy]').textContent(),packageCopy);
  assert.equal(await first.page.locator('[data-pkg] [data-package-copy]').textContent(),packageCopy);
  await first.page.locator('label.card:has([name="cameraCageRequested"][value="yes"])').click();
  assert.equal(await first.page.locator('[data-tk-tot]').textContent(),'Rs 90,000');
  await first.page.locator('[data-sum-open]').click();
  assert.equal((await first.page.locator('#mobile-summary').boundingBox()).height,844);
  assert.equal(await first.page.locator('#mobile-summary [data-tk-tot]').innerText(),'Rs 90,000');
  assert.equal(await first.page.locator('#mobile-summary [data-package-copy]').textContent(),'30-day package: Rs 80,000 if confirmed by staff.');
  await first.page.keyboard.press('Escape');
  await first.page.locator('#mobile-summary').waitFor({state:'hidden'});
  await first.page.waitForFunction(()=>document.activeElement.hasAttribute('data-sum-open'));
  await first.page.locator('[name="endDate"]').fill(futureBookingDate(12));
  await first.page.locator('label.card:has([name="cameraCageRequested"][value="no"])').click();
  await first.page.locator('[data-step-h="2"]').click();
  await first.page.getByRole('button',{name:'Add another dog'}).click();
  await first.page.locator('[data-next="2"]').click();
  assert.equal(await first.page.locator('[name="dog1-petName"]').getAttribute('aria-invalid'),'true');
  await first.page.getByRole('button',{name:'Remove dog'}).click();
  assert.equal(await first.page.locator('[name="dog1-petName"]').count(),0);
  await first.page.getByRole('button',{name:'Add another dog'}).click();
  const dog=first.page.locator('#booking-step-2 .extra-dog');
  for(const [field,value] of [['petName','Synthetic Dog Two'],['breed','Mixed'],['age','3 years']]){
    await dog.locator('[name="dog2-'+field+'"]').fill(value);
  }
  for(const [field,value] of [['gender','Male'],['vaccinationStatus','None'],['distemperHistory','No'],['cameraCageRequested','yes']]){
    await dog.locator('label:has([name="dog2-'+field+'"][value="'+value+'"])').click();
  }
  assert.equal(await first.page.locator('[data-tk-tot]').textContent(),'Rs 16,500');
  assert.equal(await first.page.locator('[data-tk-space]').textContent(),'1 standard + 1 camera');
  await first.page.locator('[data-next="2"]').click();
  await first.page.locator('#transport-pickup').check();
  await first.page.locator('#transport-dropoff').check();
  assert.equal(await first.page.locator('[data-tk-trans]').textContent(),'To be quoted');
  assert.equal(await first.page.locator('#same-dropoff').isChecked(),true);
  assert.equal(await first.page.locator('#dropoff-location').isVisible(),false);
  await first.page.locator('[data-next="3"]').click();
  assert.match(await first.page.locator('[data-f="pickupLink"] .f-err').innerText(),/confirm the pickup gate/i);
  assert.equal(saved.length,0);
  await confirmExactPin(first.page,'33.700000, 73.080000');
  await fillBookingCareAndContact(first.page,'dog2-');
  assert.equal(await first.page.locator('[name="whatsappServiceOptIn"]').count(),0);
  await first.page.locator('#submit').click();
  await first.page.locator('#complete').waitFor({state:'visible'});
  assert.equal(await first.page.evaluate(()=>document.activeElement.id),'complete');
  assert.equal(saved.length,1);
  assert.deepEqual(saved[0].transportLocation,{
    latitude:33.7,longitude:73.08,service:'both',customerConfirmed:true});
  assert.equal(saved[0].transportDropoffLocation,undefined);
  assert.equal(saved[0].details.whatsappServiceOptIn,undefined);
  assert.equal(await first.page.locator('#complete [data-np-name]').innerText(),'APEX SYNTHETIC CANARY DOG, SYNTHETIC DOG TWO');
  assert.equal(saved[0].additionalDogs[0].petName,'Synthetic Dog Two');
  assert.equal(saved[0].additionalDogs[0].details.cameraCageRequested,true);
  assert.equal(saved[0].additionalDogs[0].details.personalityTraits.allergies,true);
  assert.equal(await first.page.locator('#complete [contenteditable]').count(),0);
  assert.equal(Object.keys(saved[0].details.personalityTraits).length,8);
  assert.deepEqual(first.errors,[]);
  await first.page.close();

  // None is an explicit choice, exclusive with other services; an unanswered
  // transport question must not silently be interpreted as None.
  const second=await newPage();
  await second.page.locator('[data-next="3"]').click();
  assert.match(await second.page.locator('[data-f="transport"] .f-err').innerText(),/pickup, drop-off, both, or no transport/i);
  assert.equal(saved.length,1);
  await second.page.locator('#transport-none').check();
  await submitRequest(second.page);
  await second.page.locator('#complete').waitFor({state:'visible'});
  assert.equal(saved.length,2);
  assert.equal(saved[1].transportLocation,undefined);
  assert.equal(saved[1].details.pickupDropoffRequested,false);
  assert.deepEqual(second.errors,[]);
  await second.page.close();

  // Both with genuinely different gates must require and preserve two
  // independent Maps pins, not silently duplicate the first one.
  const third=await newPage();
  await third.page.locator('#transport-pickup').check();
  await third.page.locator('#transport-dropoff').check();
  await confirmExactPin(third.page,'33.700000, 73.080000');
  await third.page.locator('#same-dropoff').uncheck();
  assert.equal(await third.page.locator('#dropoff-location').isVisible(),true);
  await third.page.locator('[data-next="3"]').click();
  assert.match(await third.page.locator('[data-f="dropoffLink"] .f-err').innerText(),/confirm the drop-off gate/i);
  assert.equal(saved.length,2);
  await confirmExactPin(third.page,'33.580000, 73.020000','dropoff-');
  await submitRequest(third.page);
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
  await fourth.page.locator('#transport-pickup').check();
  assert.equal(await fourth.page.locator('#pickup-location').isVisible(),true);
  assert.equal(await fourth.page.locator('#dropoff-location').isVisible(),false);
  await confirmExactPin(fourth.page,'33.700000, 73.080000');
  await submitRequest(fourth.page);
  await fourth.page.locator('#complete').waitFor({state:'visible'});
  assert.equal(saved.length,4);
  assert.equal(saved[3].transportLocation.service,'pickup');
  assert.equal(saved[3].transportDropoffLocation,undefined);
  await fourth.page.close();

  // Drop-off can stand alone and must use its own pin, not the hidden pickup
  // field that used to serve both roles.
  const fifth=await newPage();
  await fifth.page.locator('#transport-dropoff').check();
  assert.equal(await fifth.page.locator('#pickup-location').isVisible(),false);
  assert.equal(await fifth.page.locator('#dropoff-location').isVisible(),true);
  await confirmExactPin(fifth.page,'33.580000, 73.020000','dropoff-');
  await submitRequest(fifth.page);
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
  await mapped.page.locator('[data-next="3"]').click();
  assert.equal(saved.length,5,'An unconfirmed moved map must never reach persistence');
  assert.match(await mapped.page.locator('[data-f="pickupLink"] .f-err').innerText(),/confirm the pickup gate/i);
  await mapped.page.locator('#choose-map').click();
  await mapped.page.locator('#map-confirm').click();
  await mapped.page.locator('#transport-dropoff').check();
  await mapped.page.locator('#same-dropoff').uncheck();
  await mapped.page.locator('#dropoff-choose-map').click();
  await moveSyntheticMap(mapped.page,33.58,73.02);
  await mapped.page.locator('#map-confirm').click();
  await submitRequest(mapped.page);
  await mapped.page.locator('#complete').waitFor({state:'visible'});
  assert.equal(saved.length,6);
  assert.deepEqual(saved[5].transportLocation,{latitude:33.702,longitude:73.082,service:'both',customerConfirmed:true});
  assert.deepEqual(saved[5].transportDropoffLocation,{latitude:33.58,longitude:73.02,customerConfirmed:true});
  assert.deepEqual(mapped.errors,[]);
  await mapped.page.close();

  // Exact Google coordinates are valid candidates; viewport centres and
  // ambiguous shared links never become a substitute for an exact gate.
  const fallback=await newPage();
  await fallback.page.locator('#transport-pickup').check();
  await revealPinFallback(fallback.page);
  await fallback.page.locator('#maps-link').fill('https://www.google.com/maps/search/?api=1&query=33.7%2C73.08');
  await fallback.page.locator('#map-fallback').click();
  await fallback.page.locator('[data-next="3"]').click();
  assert.equal(saved.length,6,'Exact pasted pin still requires explicit gate confirmation');
  await fallback.page.locator('#confirm-gate').click();
  await fallback.page.locator('#maps-link').fill('https://www.google.com/maps/@33.7,73.08,16z');
  await waitForBrowser(fallback.page,()=>/exact gate pin/.test(document.querySelector('#coordinate-status').textContent));
  assert.equal(await fallback.page.locator('#selected-location-link').isVisible(),false);
  assert.equal(await fallback.page.locator('#confirm-gate').isVisible(),false);
  await fallback.page.locator('[data-next="3"]').click();
  assert.equal(saved.length,6);
  await fallback.page.locator('#maps-link').fill('31.5, 74.3');
  await waitForBrowser(fallback.page,()=>/Islamabad|Rawalpindi|service area/.test(document.querySelector('#coordinate-status').textContent));
  assert.equal(await fallback.page.locator('#confirm-gate').isVisible(),false);
  await fallback.page.evaluate(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(_ok,fail){fail({code:1});}}}));
  await fallback.page.locator('#locate').click();
  assert.match(await fallback.page.locator('#coordinate-status').innerText(),/permission was not granted/i);
  await confirmExactPin(fallback.page,'33.7, 73.08');
  await submitRequest(fallback.page);
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
  await revealPinFallback(delayed.page,'dropoff-');
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
  assert.equal(await actual.page.evaluate(()=>performance.getEntriesByType('resource')
    .some(item=>/maplibre|tiles\.openfreemap\.org/.test(item.name))),false,
    'Initial booking and transport selection must not download the map');
  const mapStarted=Date.now();
  await actual.page.locator('#choose-map').click();
  await actual.page.locator('#map-canvas canvas').waitFor({state:'visible'});
  await waitForBrowser(actual.page,()=>document.querySelector('#map-loading')?.hidden===true,45000);
  assert.equal(await actual.page.evaluate(()=>typeof window.maplibregl?.Map),'function');
  assert.equal(await actual.page.evaluate(()=>window.__syntheticMaps),undefined);
  const mapAssets=await actual.page.evaluate(()=>performance.getEntriesByType('resource')
    .filter(item=>item.name.includes('/book/vendor/')).map(item=>({name:item.name,bytes:item.decodedBodySize})));
  assert.equal(mapAssets.filter(item=>item.name.endsWith('/maplibre-gl-5.6.1.js')).length,1,
    'Load the map library only once');
  assert(mapAssets.reduce((total,item)=>total+item.bytes,0)<1_500_000,
    'Local map assets exceeded the download budget');
  console.log('Lazy map ready in '+(Date.now()-mapStarted)+'ms; initial booking downloaded no map assets.');
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

  // Hold the style and then hold actual vector requests independently.
  // Simulate a dropped connection while the customer is navigating, then
  // check that a reconnection fetches usable tiles without recreating the map.
  const interrupted=await newPage({map:'real',viewport:{width:1280,height:900}});
  const outagePage=interrupted.page;
  // Minimal version-2 vector tile with an empty roads layer and extent 4096.
  const tilePbf=Buffer.from('1a0c78020a05726f616473288020','hex');
  let releaseStyle,releaseTiles,styleRequests=0,tileRequests=0,failedTiles=0,recoveredTiles=0;
  const slowStyle=new Promise(resolve=>{releaseStyle=resolve;});
  const slowTiles=new Promise(resolve=>{releaseTiles=resolve;});
  let connection='slow';
  await outagePage.route('https://tiles.openfreemap.org/**',async route=>{
    const url=route.request().url();
    if(url.endsWith('/styles/liberty')){
      styleRequests++;
      await slowStyle;
      return route.fulfill({json:{version:8,sources:{roads:{type:'vector',tiles:['https://tiles.openfreemap.org/fixture/{z}/{x}/{y}.pbf']}},
        layers:[{id:'roads',type:'line',source:'roads','source-layer':'roads'}]}});
    }
    tileRequests++;
    if(connection==='slow')await slowTiles;
    if(connection==='offline'){
      failedTiles++;
      return route.abort('internetdisconnected');
    }
    return route.fulfill({contentType:'application/x-protobuf',body:tilePbf,headers:{'access-control-allow-origin':'*'}});
  });
  outagePage.on('response',response=>{
    if(response.url().includes('/fixture/')&&response.status()===200)recoveredTiles++;
  });
  await outagePage.locator('#transport-pickup').check();
  await outagePage.locator('#transport-dropoff').check();
  await outagePage.locator('#same-dropoff').uncheck();
  const googleGuide=outagePage.locator('#dropoff-google-gate');
  await googleGuide.locator('summary').press('Enter');
  assert.equal(await googleGuide.locator('li:visible').count(),4);
  assert.match(await googleGuide.locator('ol').innerText(),/vehicle gate[\s\S]*Share, then Copy link[\s\S]*Come back here and paste/);
  assert.equal(await outagePage.locator('#dropoff-open-google-maps').getAttribute('target'),'_blank');
  await outagePage.getByRole('textbox',{name:'Or paste a Google Maps pin'}).last().fill('not a maps link');
  await outagePage.locator('#dropoff-coordinate-status').filter({hasText:'exact gate pin'}).waitFor();
  assert.equal(await outagePage.locator('#gate-picker').isVisible(),false);
  await outagePage.getByRole('textbox',{name:'Or paste a Google Maps pin'}).last().fill('https://www.google.com/maps/search/?api=1&query=33.7%2C73.08');
  await outagePage.locator('#gate-picker-title').filter({hasText:'drop-off'}).waitFor();
  assert.equal(await outagePage.locator('#map-loading').isVisible(),true);
  assert.equal(await outagePage.locator('#map-confirm').isDisabled(),true);
  assert.equal(await outagePage.locator('#dropoff-confirm-gate').isVisible(),false);
  releaseStyle();
  await outagePage.locator('#map-loading').waitFor({state:'hidden'});
  const outageCanvas=outagePage.locator('#map-canvas canvas');
  await waitForBrowser(outagePage,()=>!document.querySelector('#map-confirm').disabled);
  assert(tileRequests>0,'Fixture should hold actual tile requests');
  assert.equal(recoveredTiles,0,'Confirmation must work while all tile responses are pending');
  await outagePage.locator('#map-confirm').click();
  assert.match(await outagePage.locator('#dropoff-coordinate-status').innerText(),/confirmed/i);
  await outagePage.locator('#dropoff-choose-map').click();
  assert.equal(await outagePage.locator('#map-loading').isVisible(),false);
  await outagePage.evaluate(()=>{
    window.__loadingReturned=false;
    new MutationObserver(()=>{
      window.__loadingReturned||=!document.querySelector('#map-loading').hidden;
    }).observe(document.querySelector('#map-loading'),{attributeFilter:['hidden']});
  });
  connection='offline';
  const tileFailed=outagePage.waitForEvent('requestfailed',request=>request.url().includes('/fixture/'));
  releaseTiles();
  await tileFailed;
  await outageCanvas.scrollIntoViewIfNeeded();
  const box=await outageCanvas.boundingBox();
  await outagePage.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await outagePage.mouse.down();
  await outagePage.mouse.move(box.x+box.width/2+60,box.y+box.height/2+35,{steps:12});
  assert.equal(await outagePage.locator('#map-confirm').isDisabled(),true);
  assert.equal(await outagePage.locator('#map-loading').isVisible(),false);
  assert.doesNotMatch(await outagePage.locator('#dropoff-coordinate-status').innerText(),/confirmed/i);
  await outagePage.mouse.up();
  await outageCanvas.press('+');
  await waitForBrowser(outagePage,()=>!document.querySelector('#map-confirm').disabled);
  assert(failedTiles>0);
  connection='online';
  const restoredTile=outagePage.waitForResponse(response=>response.url().includes('/fixture/')&&response.ok());
  await outagePage.evaluate(()=>window.dispatchEvent(new Event('online')));
  await restoredTile;
  assert.equal(await outagePage.evaluate(()=>window.__loadingReturned),false);
  await outagePage.locator('#map-confirm').click();
  await outagePage.locator('#choose-map').click();
  await outagePage.locator('#map-loading').waitFor({state:'hidden'});
  assert.equal(styleRequests,1,'Reopen and gate switch must reuse the style and map');
  assert.equal(await outagePage.locator('.map-attribution a:visible').count(),3);
  assert.match(await outagePage.locator('#dropoff-coordinate-status').innerText(),/confirmed/i);
  assert.deepEqual(interrupted.errors,[]);
  await outagePage.close();
  console.log('Slow style and pending tiles, tile outage, reconnection, and Google Maps drop-off review passed with real MapLibre.');

  // A real mobile MapLibre canvas catches ResizeObserver/layout feedback
  // loops which a Map stub cannot reproduce. Basemap data stays synthetic.
  const phoneMap=await newPage({map:'real'});
  await phoneMap.page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#dbe5dd'}}]}}));
  await phoneMap.page.locator('#transport-pickup').check();
  await phoneMap.page.locator('#choose-map').click();
  const phoneCanvas=phoneMap.page.locator('#map-canvas canvas');
  await phoneCanvas.waitFor({state:'visible'});
  await waitForBrowser(phoneMap.page,()=>document.querySelector('#map-loading').hidden,15000);
  for(let step=0;step<6;step++){
    await phoneCanvas.press('+');
    await phoneMap.page.waitForTimeout(350);
  }
  const touch=await phoneMap.page.context().newCDPSession(phoneMap.page);
  const touchBox=await phoneCanvas.boundingBox();
  const touchPoint={x:Math.round(touchBox.x+touchBox.width/2),y:Math.round(touchBox.y+touchBox.height/2)};
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touchPoint]});
  for(let offset=10;offset<=60;offset+=10)
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchPoint.x+offset,y:touchPoint.y}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await phoneMap.page.locator('#map-loading').isVisible(),false);
  await phoneCanvas.tap({position:{x:160,y:120}});
  await waitForBrowser(phoneMap.page,()=>!document.querySelector('#map-confirm').disabled,15000);
  await phoneMap.page.evaluate(()=>{
    const read=()=>({loading:!document.querySelector('#map-loading').hidden,
      disabled:document.querySelector('#map-confirm').disabled,
      status:document.querySelector('#map-status').textContent});
    window.__mobileMapIdle={initial:read(),transitions:[]};
    let last=JSON.stringify(read());
    window.__mobileMapObserver=new MutationObserver(()=>{
      const next=read(),key=JSON.stringify(next);
      if(key!==last){window.__mobileMapIdle.transitions.push(next);last=key;}
    });
    window.__mobileMapObserver.observe(document.querySelector('#gate-picker'),{subtree:true,attributes:true,childList:true,characterData:true});
  });
  const phoneSize=await phoneCanvas.boundingBox();
  await phoneMap.page.waitForTimeout(1200);
  const idle=await phoneMap.page.evaluate(()=>{
    window.__mobileMapObserver.disconnect();return window.__mobileMapIdle;
  });
  assert.equal(idle.initial.loading,false);
  assert.equal(idle.initial.disabled,false);
  assert.deepEqual(idle.transitions,[],'Real mobile map repeatedly left its idle confirmation state');
  const stablePhoneSize=await phoneCanvas.boundingBox();
  assert(Math.abs(phoneSize.height-stablePhoneSize.height)<1,'Real mobile map canvas height kept resizing after selection');
  await phoneMap.page.screenshot({path:'mobile-real-maplibre-phone.png',fullPage:false});
  await phoneMap.page.locator('#map-confirm').click();
  await phoneMap.page.locator('#gate-picker').waitFor({state:'hidden'});
  assert.match(await phoneMap.page.locator('#coordinate-status').innerText(),/gate confirmed/i);
  assert.equal(await phoneMap.page.locator('#choose-map').evaluate(el=>el===document.activeElement),true);
  assert.deepEqual(phoneMap.errors,[]);
  await phoneMap.page.close();
  console.log('Real mobile MapLibre remained idle for 1.2 seconds and confirmed a tapped gate; basemap data synthetic.');
  console.log('Synthetic browser-to-Worker booking passed: explicit None, pickup only, drop-off only, Both same gate and Both different gates, map invalidation, exact-pin confirmation, service bounds, denied GPS and map-load fallback; no real writes/messages.');
} finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
