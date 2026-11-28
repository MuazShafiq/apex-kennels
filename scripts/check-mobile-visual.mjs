import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {chromium} from 'playwright';
import {handleBusinessSettings} from '../src/staff-business-settings.ts';
import {renderStaffConsoleHtml} from '../src/staff-console.ts';
import {syntheticBookings} from '../src/staff-bookings.ts';
import {renderStaffTransportForm} from '../src/staff-transport-review.ts';
import {renderStaffBookingDetail} from '../src/staff-booking-detail.ts';
import {renderStaffDraftReview,prepareStaffDraftReview} from '../src/staff-invoice-draft.ts';
import {renderStaffPinChecker} from '../src/staff-location.ts';
import {renderInvoiceApprovalPage} from '../src/staff-invoice-approval.ts';
import {makeReviewSnapshot} from '../src/staff-saved-review.ts';
import {confirmExactPin,stubMapLibrary,moveSyntheticMap,waitForBrowser,fillBookingThroughDog,fillBookingCareAndContact} from './gate-picker-browser-fixture.mjs';

const demoSource={
  bookingId:'a2026111-0e00-4c11-8a00-000000000033',
  customerName:'APEX CANARY TRANSPORT',petNames:'APEX SYNTHETIC CANARY PET',
  petCount:1,startDate:'2026-12-10',endDate:'2026-12-12',
  status:'requested',cameraCageRequested:false,transportRequested:true,synthetic:true,
  transportLocation:{latitude:33.70,longitude:73.08,service:'both',customerConfirmed:true}
};
const base=process.cwd();
const detail={
  id:demoSource.bookingId,customerName:demoSource.customerName,status:'reviewing',stayHistory:[],
  createdAt:'2026-11-10T00:00:00Z',startDate:demoSource.startDate,endDate:demoSource.endDate,
  email:null,phone:'0000000000',accommodationType:null,isSynthetic:true,hasFormDetails:true,
  pets:[{name:'APEX SYNTHETIC CANARY PET',breed:'Synthetic'}],
  transportLocation:demoSource.transportLocation,
  ownerAddress:'Synthetic location',pickupDropoffRequested:true,cameraCageRequested:false,
  emergencyContactPhone:'0000000000',petGender:null,petAgeDescription:null,
  vaccinationStatus:null,distemperHistory:null,veterinarianPhone:null,
  personalityTraits:null,specialInstructions:null,medicationFeedingInstructions:null,termsAccepted:true
};
const rate={version:3,effectiveFrom:'2026-11-01T00:00:00+05:00',stdDaily:2500,cameraDaily:3000,
  packageDays:30,packageDiscount:10000,kmPerLitre:12,markupPct:20,freshnessHours:24,fuelMode:'published',
  fixedFuelPkr:null,fixedUntil:null,fixedReason:null,summary:'Current rates',createdBy:'owner@example.test',createdAt:'2026-11-01T00:00:00+05:00'};
let published,liveRate=rate;
const pages={
  '/staff/invoices/review':renderInvoiceApprovalPage({saved:{snapshot:makeReviewSnapshot(prepareStaffDraftReview({...demoSource,transportRequested:false,transportLocation:undefined},'daily')),revision:1,updatedBy:'owner@example.test',updatedAt:new Date().toISOString()},approvalEnabled:true,issuanceEnabled:false,sendEnabled:false}),
  '/demo/staff':renderStaffConsoleHtml(syntheticBookings,{demo:true,filter:{query:'',status:'all'}}),
  '/staff/transport':renderStaffTransportForm(demoSource,'daily',0),
  '/staff/booking':renderStaffBookingDetail(detail,undefined,{email:'owner@example.test',showTools:true}),
  '/staff/draft':renderStaffDraftReview(prepareStaffDraftReview(demoSource,'daily')),
  '/staff/location':renderStaffPinChecker()
};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url??'/', 'http://127.0.0.1');
  if(url.pathname.startsWith('/staff/settings')){
    const headers=new Headers({...req.headers,'Cf-Access-Jwt-Assertion':'synthetic-settings-fixture'});
    const method=req.method;
    const chunks=[];
    for await(const chunk of req)chunks.push(chunk);
    const origin='http://127.0.0.1:'+server.address().port;
    const request=new Request(origin+req.url,{method,headers,...(method==='POST'?{body:Buffer.concat(chunks)}:{})});
    const response=await handleBusinessSettings(request,'synthetic-no-database','owner@example.test',true,true,
      {},r=>r.json(),{
        read:async()=>({now:new Date('2026-11-28T09:00:02Z'),current:liveRate,cards:liveRate===rate?[rate]:[liveRate,rate],
          impact:{issued:1,saved:2,open:3},highestReservedNumber:0}),
        publish:async(_url,_actor,body)=>{
          published=body;
          liveRate={...rate,...body.card,version:4,effectiveFrom:'2026-11-28T09:00:01Z',summary:'Fixture publication'};
          return {version:4,effectiveFrom:liveRate.effectiveFrom,summary:liveRate.summary,withdrew:null};
        },
      });
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(url.pathname==='/api/rate-card/current'){
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({version:1,effectiveFrom:'2026-01-01T00:00:00Z',stdDaily:2500,cameraDaily:3000,packageDays:30,packageDiscount:10000}));return;
  }
  if(url.pathname==='/api/book/config'){
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({enabled:false}));return;
  }
  if(url.pathname==='/api/book/location'){
    const chunks=[];
    for await(const chunk of req)chunks.push(chunk);
    const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(payload.link==='https://maps.app.goo.gl/ambiguous'){
      res.writeHead(422,{'content-type':'application/json'});
      res.end(JSON.stringify({code:'NOT_EXACT_PIN',
        error:'This Maps link does not expose an exact pin. Long-press your gate in Google Maps, then paste its latitude, longitude here.'}));
      return;
    }
    const pair=/^(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)$/.exec(payload.link);
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify(pair?{latitude:Number(pair[1]),longitude:Number(pair[2])}:{latitude:33.7,longitude:73.08}));return;
  }
  if(pages[url.pathname]){
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(pages[url.pathname]);return;
  }
  let route=url.pathname;
  if(route==='/book'||route==='/book/')route='/book/index.html';
  if((!route.startsWith('/book/')&&!route.startsWith('/site/')) || route.includes('..')){
    res.writeHead(404);res.end();return;
  }
  const filename=resolve(base,'public',route.slice(1));
  if(!filename.startsWith(resolve(base,'public')+sep)){res.writeHead(404);res.end();return;}
  try{
    const bytes=await readFile(filename);
    const mime=route.endsWith('.css')?'text/css':route.endsWith('.js')?'application/javascript':
      route.endsWith('.svg')?'image/svg+xml':route.endsWith('.woff2')?'font/woff2':
      route.endsWith('.webp')?'image/webp':route.endsWith('.png')?'image/png':'text/html';
    res.writeHead(200,{'content-type':mime});res.end(bytes);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[];
const assert=(v,m)=>{if(!v)throw new Error(m);};
try{
 for(const [name,viewport] of [
   ['small-phone',{width:320,height:740}],
   ['iphone',{width:390,height:844}],
   ['large-phone',{width:430,height:932}],
   ['tablet',{width:768,height:1024}],
   ['desktop',{width:1440,height:900}],
   ['wide-desktop',{width:2200,height:1000}]
 ]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1,isMobile:name.includes('phone')||name==='iphone',hasTouch:true});
  await stubMapLibrary(page);
  await page.route('**/challenges.cloudflare.com/**',route=>route.abort());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [route,label] of [['/book','book'],['/demo/staff','dashboard'],['/staff/transport','transport'],['/staff/booking','detail'],['/staff/draft','draft'],['/staff/location','location'],['/staff/invoices/review','approval'],['/staff/settings','settings']]){
   await page.goto('http://127.0.0.1:'+port+route,{waitUntil:'domcontentloaded'});
   await page.waitForTimeout(200);
   const size=await page.evaluate(()=>({
     window:window.innerWidth,scroll:document.documentElement.scrollWidth,
     body:document.body.scrollWidth
   }));
   assert(size.scroll<=size.window+2,name+' '+label+' has horizontal overflow '+JSON.stringify(size));
   // Background is owned by the full-width page surface, not a centered
   // content panel. Collapsed child margins must not push the body's paint
   // below the top of the viewport.
   const paint=await page.evaluate(()=>{
     const body=document.body,shell=document.querySelector('.shell');
     return {
       bodyTop:body.getBoundingClientRect().top,
       bodyHeight:body.getBoundingClientRect().height,
       shellWidth:shell?.getBoundingClientRect().width??null,
       clientWidth:document.documentElement.clientWidth,
       shellBackground:shell?getComputedStyle(shell).backgroundImage:null,
       mainBackground:document.querySelector('main')?getComputedStyle(document.querySelector('main')).backgroundImage:null,
       bodyBackground:getComputedStyle(body).backgroundImage
     };
   });
   if(label==='dashboard'){
     assert(paint.shellWidth>=paint.clientWidth-1,name+' dashboard surface misses viewport edges');
     assert(paint.shellBackground?.includes('linear-gradient'),name+' dashboard full-width gradient missing');
     assert(paint.mainBackground==='none',name+' dashboard gradient must not be on capped main');
     const seam=await page.evaluate(()=>{
       const shell=document.querySelector('.shell')?.getBoundingClientRect();
       const sidebar=document.querySelector('.sidebar');
       const sb=sidebar?.getBoundingClientRect();
       const main=document.querySelector('main')?.getBoundingClientRect();
       const sidebarVisible=sidebar&&getComputedStyle(sidebar).display!=='none';
       return {left:main?.left,right:main?.right,
         expectedLeft:sidebarVisible?sb?.right:shell?.left,
         expectedRight:shell?.right};
     });
     assert(Math.abs(seam.right-seam.expectedRight)<2,
       name+' dashboard leaves an unpainted right gutter '+JSON.stringify(seam));
     assert(Math.abs(seam.left-seam.expectedLeft)<2,
       name+' dashboard leaves an unpainted sidebar seam '+JSON.stringify(seam));
   }else if(['detail','draft','transport','location','approval'].includes(label)){
     assert(Math.abs(paint.bodyTop)<1,name+' '+label+' first-child margin moved the page background');
     assert(paint.bodyHeight>=viewport.height-1,name+' '+label+' background too short');
     assert(paint.bodyBackground?.includes('linear-gradient'),name+' '+label+' body gradient missing');
   }
   if(label==='book'){
     const mark=page.locator('.top .logo .mk');
     assert(await mark.count()===1,name+' booking nav missing Apex badge');
     const mask=await mark.evaluate(el=>getComputedStyle(el).maskImage);
     assert(mask.startsWith('url('),name+' booking badge missing shepherd mask');
     const markUrl=mask.slice(5,-2);
     assert((await page.request.get(markUrl)).ok(),name+' booking shepherd asset failed to load');
     const heights=await page.locator('label.card:has(input[name="cameraCageRequested"])')
       .evaluateAll(nodes=>nodes.map(el=>el.getBoundingClientRect().height));
     assert(heights.length===2,name+' boarding choices missing');
     assert(Math.abs(heights[0]-heights[1])<1,
       name+' standard and camera cards unequal: '+JSON.stringify(heights));
   }else if(['dashboard','settings','detail'].includes(label)){
     const mark=page.locator('.ak-st-badge');
     assert(await mark.count()===1,name+' '+label+' missing Apex badge');
     const mask=await mark.evaluate(el=>getComputedStyle(el,'::before').maskImage);
     assert(mask.startsWith('url('),name+' '+label+' missing approved shepherd mask');
     assert((await page.request.get(mask.slice(5,-2))).ok(),name+' '+label+' shepherd asset failed to load');
   }else{
     const logo=page.locator('img[src="/book/apex-dog-mark.svg"]').first();
     assert(await logo.count()===1,name+' '+label+' missing Apex mark');
     assert(await logo.evaluate(el=>el.complete&&el.naturalWidth>0),name+' '+label+' logo failed to load');
   }
   if(label==='detail'){
     const overview=page.getByRole('tab',{name:'Overview'});
     await overview.waitFor();
     assert(await overview.getAttribute('aria-selected')==='true',name+' Overview not selected');
     await overview.press('ArrowRight');
     assert(await page.getByRole('tab',{name:'Transport'}).getAttribute('aria-selected')==='true', name+' keyboard did not select Transport');
     assert(!(await page.locator('#overview').isVisible())&&await page.locator('#transport').isVisible(),name+' detail tab panel visibility');
     await page.getByRole('tab',{name:'Overview'}).click();
   }
   if(label==='settings'){
     await page.getByRole('heading',{name:'Business settings.'}).waitFor();
     assert(await page.locator('h1').evaluate(el=>el===document.activeElement),name+' settings heading does not receive focus');
     assert(await page.locator('#stdPackage').textContent()===(liveRate===rate?'PKR 65,000':'PKR 71,000'),name+' settings package price missing');
     const menu=page.locator('.ak-st-menu summary');
     if(viewport.width<900){
       await menu.press('ArrowDown');
       await page.locator('#ak-st-mobile a[aria-current]').waitFor({state:'visible'});
       assert(await page.locator('#ak-st-mobile a[aria-current]').evaluate(el=>el===document.activeElement),name+' menu did not focus current tab');
       await page.keyboard.press('Escape');
       assert(await menu.evaluate(el=>el===document.activeElement),name+' menu did not restore trigger focus');
     }
     if(name==='small-phone'){
       await page.getByLabel('30-day package discount').fill('75000');
       assert(await page.locator('#stdPackage').textContent()==='—',name+' invalid package produced a price');
       assert(await page.getByLabel('30-day package discount').getAttribute('aria-invalid')==='true',name+' package error not linked');
       await page.getByLabel('30-day package discount').fill('10000');
       await page.getByLabel('Standard boarding').fill('2700');
       await page.getByRole('button',{name:'Review and publish'}).click();
       const dialog=page.getByRole('dialog');
       await dialog.waitFor();
       assert((await dialog.innerText()).includes('1 issued invoices unchanged'),name+' missing review impact');
       assert(await dialog.getByRole('button',{name:'Publish',exact:true}).getAttribute('aria-disabled')==='true',name+' unconfirmed publish allowed');
       await dialog.getByRole('checkbox').check();
       await dialog.getByRole('button',{name:'Publish',exact:true}).click();
       await page.getByText('Rate card version 4 published.',{exact:false}).waitFor();
       assert(await page.locator('#stdPackage').textContent()==='PKR 71,000',name+' published rate did not render');
       assert(published.expectedLatestVersion===3&&published.card.stdDaily===2700&&published.confirmed===true,
         name+' publish did not send the reviewed card');
     }
   }
   if(label==='approval'){
     await page.locator('#invoiceNumber').focus();
     assert(await page.locator('#invoiceNumber').evaluate(el=>el===document.activeElement),name+' approval number cannot receive focus');
     assert(await page.getByLabel('Four-digit invoice number').count()===1,name+' invoice label missing');
     const checks=await page.locator('.check').evaluateAll(nodes=>nodes.map(node=>{const a=node.querySelector('input').getBoundingClientRect(),b=node.querySelector('span').getBoundingClientRect();return {right:a.right,left:b.left};}));
     assert(checks.every(x=>x.right<=x.left),name+' approval checkbox overlaps label');
     await page.getByRole('button',{name:'Approve snapshot'}).click();
     assert(await page.locator('#invoiceNumber').evaluate(el=>!el.validity.valid),name+' empty invoice number accepted');
   }
   await page.screenshot({path:'mobile-'+name+'-'+label+'.png',fullPage:label!=='book'});
   results.push({viewport:name,page:label,...size});
  }
  await page.goto('http://127.0.0.1:'+port+'/book',{waitUntil:'domcontentloaded'});
  await fillBookingThroughDog(page);
  const checkboxAlignment=selector=>[...document.querySelectorAll(selector)].map(label=>{
    const mark=label.querySelector('.cb').getBoundingClientRect();
    const text=label.querySelector('.cb + span');
    const lineHeight=parseFloat(getComputedStyle(text).lineHeight)||20;
    const copy=text.getBoundingClientRect();
    return {name:label.querySelector('input').name,gap:copy.left-mark.right,
      dy:Math.abs((mark.top+mark.bottom)/2-(copy.top+lineHeight/2))};
  });
  const verifyAlignment=items=>{
    for(const item of items){
      assert(item.gap>=7,name+' '+item.name+' checkbox overlaps label '+JSON.stringify(item));
      assert(item.dy<7,name+' '+item.name+' checkbox not aligned to text '+JSON.stringify(item));
    }
  };
  const choices=await page.evaluate(checkboxAlignment,'.tchoice .tbox');
  verifyAlignment(choices);

  await page.locator('#transport-pickup').check();
  assert(await page.locator('#pickup-location').isVisible(),name+' pickup must reveal location');
  await page.locator('#choose-map').click();
  await page.locator('#map-confirm').waitFor({state:'visible'});
  await moveSyntheticMap(page,33.7,73.08);
  const picker=await page.locator('#gate-picker').boundingBox();
  assert(picker&&picker.width<=viewport.width+2&&picker.x>=-1,name+' map picker exceeds viewport');
  const controls=await page.locator('#gate-picker button:visible').evaluateAll(nodes=>nodes.map(node=>{
    const r=node.getBoundingClientRect();return {text:node.textContent,width:r.width,height:r.height};
  }));
  assert(controls.every(control=>control.width>=44&&control.height>=44),name+' map controls have undersized touch targets '+JSON.stringify(controls));
  assert(await page.locator('#gate-picker a[href*="openfreemap.org"]').isVisible(),name+' OpenFreeMap attribution missing');
  assert(await page.locator('#gate-picker a[href*="openstreetmap.org"]').isVisible(),name+' OpenStreetMap attribution missing');
  await page.screenshot({path:'mobile-'+name+'-map-picker.png',fullPage:false});
  const canvas=page.locator('#map-canvas canvas');
  await canvas.focus();
  assert(await canvas.evaluate(el=>el===document.activeElement),name+' map keyboard focus missing');
  await canvas.press('ArrowRight');
  await waitForBrowser(page,()=>document.querySelector('#map-confirm').disabled===false);
  await page.locator('#map-confirm').focus();
  await page.locator('#map-confirm').press('Enter');
  await page.locator('#gate-picker').waitFor({state:'hidden'});
  await page.locator('#selected-location-link').waitFor({state:'visible'});
  assert(await page.locator('#choose-map').evaluate(el=>el===document.activeElement),name+' map confirmation does not restore launcher focus');
  await page.locator('#choose-map').click();
  await page.locator('#map-close').click();
  await page.locator('#google-gate summary').press('Enter');
  assert(await page.locator('#google-gate li:visible').count()===4,name+' Google Maps instructions missing');
  const openMaps=page.locator('#open-google-maps');
  assert((await openMaps.boundingBox()).height>=44,name+' Google Maps link has an undersized touch target');
  assert(await page.locator('#maps-link').evaluate(input=>getComputedStyle(input).fontSize)==='16px',
    name+' paste field is too small for mobile focus');
  await page.locator('#google-gate').screenshot({path:'mobile-'+name+'-google-gate.png'});
  await page.locator('#maps-link').fill('https://www.google.com/maps/search/?api=1&query=33.7%2C73.08');
  await page.locator('#map-fallback').click();
  await page.locator('#confirm-gate').click();
  assert(await page.locator('#selected-location-link').isVisible(),name+' pickup pin not visible');
  await page.locator('#maps-link').fill('https://maps.app.goo.gl/ambiguous');
  await page.waitForFunction(()=>document.querySelector('#coordinate-status')?.textContent.includes('latitude, longitude'));
  assert((await page.locator('#coordinate-status').innerText()).includes('latitude, longitude'),
    name+' ambiguous short link lacks coordinates fallback');
  assert(!(await page.locator('#selected-location-link').isVisible()),
    name+' ambiguous short link retained stale pin');
  await confirmExactPin(page,'33.700000, 73.080000');
  assert(await page.locator('#selected-location-link').isVisible(),
    name+' confirmed pickup coordinates missing');

  await page.locator('#transport-dropoff').check();
  assert(await page.locator('#same-dropoff').isChecked(),
    name+' Both should reuse pickup gate by default');
  assert(!(await page.locator('#dropoff-location').isVisible()),
    name+' duplicate location form should be hidden by default');
  await page.locator('#same-dropoff').uncheck();
  assert(await page.locator('#dropoff-location').isVisible(),
    name+' different drop-off must reveal second location');
  await confirmExactPin(page,'33.580000, 73.020000','dropoff-');
  assert(await page.locator('#dropoff-selected-location-link').isVisible(),
    name+' different drop-off coordinates not accepted');
  assert(await page.locator('#selected-location-link').isVisible(),
    name+' second location overwrote pickup');
  const expanded=await page.evaluate(()=>({
    width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth
  }));
  assert(expanded.scroll<=expanded.width+2,name+' expanded transport overflows screen '+JSON.stringify(expanded));
  await page.screenshot({path:'mobile-'+name+'-map-and-gates.png',fullPage:true});
  await page.locator('#transport-none').check();
  assert(!(await page.locator('#pickup-location').isVisible())&&
    !(await page.locator('#dropoff-location').isVisible()),
    name+' No transport did not collapse selected services');
  assert(!(await page.locator('#transport-pickup').isChecked())&&
    !(await page.locator('#transport-dropoff').isChecked()),
    name+' No transport did not clear other choices');
  await fillBookingCareAndContact(page);
  verifyAlignment(await page.evaluate(checkboxAlignment,'[data-f="termsAccepted"] .chk'));
  assert(await page.locator('#preview').isVisible(),name+' booking closed state disappeared');
  assert(await page.locator('#submit').isDisabled(),name+' submit enabled on a closed gate');
  assert(errors.length===0,name+' JS errors: '+errors.join(';'));
  await page.close();
 }
 console.log(JSON.stringify({ok:true,results},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
