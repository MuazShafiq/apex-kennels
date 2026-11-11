import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {renderStaffConsoleHtml} from '../src/staff-console.ts';
import {syntheticBookings} from '../src/staff-bookings.ts';
import {renderStaffTransportForm} from '../src/staff-transport-review.ts';
import {renderStaffBookingDetail} from '../src/staff-booking-detail.ts';
import {renderStaffDraftReview,prepareStaffDraftReview} from '../src/staff-invoice-draft.ts';

const demoSource={
  bookingId:'a2026111-0e00-4c11-8a00-000000000033',
  customerName:'APEX CANARY TRANSPORT',petNames:'APEX SYNTHETIC CANARY PET',
  petCount:1,startDate:'2026-12-10',endDate:'2026-12-12',
  status:'requested',cameraCageRequested:false,transportRequested:true,synthetic:true,
  transportLocation:{latitude:33.70,longitude:73.08,service:'both',customerConfirmed:true}
};
const base=process.cwd();
const detail={
  id:demoSource.bookingId,customerName:demoSource.customerName,status:'requested',
  createdAt:'2026-11-10T00:00:00Z',startDate:demoSource.startDate,endDate:demoSource.endDate,
  email:null,phone:'0000000000',accommodationType:null,isSynthetic:true,hasFormDetails:true,
  pets:[{name:'APEX SYNTHETIC CANARY PET',breed:'Synthetic'}],
  transportLocation:demoSource.transportLocation,
  ownerAddress:'Synthetic location',pickupDropoffRequested:true,cameraCageRequested:false,
  emergencyContactPhone:'0000000000',petGender:null,petAgeDescription:null,
  vaccinationStatus:null,distemperHistory:null,veterinarianPhone:null,
  personalityTraits:null,specialInstructions:null,medicationFeedingInstructions:null,termsAccepted:true
};
const pages={
  '/demo/staff':renderStaffConsoleHtml(syntheticBookings,{demo:true,filter:{query:'',status:'all'}}),
  '/staff/transport':renderStaffTransportForm(demoSource,'daily',0),
  '/staff/booking':renderStaffBookingDetail(detail),
  '/staff/draft':renderStaffDraftReview(prepareStaffDraftReview(demoSource,'daily'))
};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url??'/', 'http://127.0.0.1');
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
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({latitude:33.7,longitude:73.08}));return;
  }
  if(pages[url.pathname]){
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(pages[url.pathname]);return;
  }
  let route=url.pathname;
  if(route==='/book'||route==='/book/')route='/book/index.html';
  if(!route.startsWith('/book/') || route.includes('..')){
    res.writeHead(404);res.end();return;
  }
  const filename=resolve(base,'public',route.slice(1));
  if(!filename.startsWith(resolve(base,'public')+'/')){res.writeHead(404);res.end();return;}
  try{
    const bytes=await readFile(filename);
    const mime=route.endsWith('.css')?'text/css':route.endsWith('.js')?'application/javascript':
      route.endsWith('.svg')?'image/svg+xml':'text/html';
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
  await page.route('**/challenges.cloudflare.com/**',route=>route.abort());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [route,label] of [['/book','book'],['/demo/staff','dashboard'],['/staff/transport','transport'],['/staff/booking','detail'],['/staff/draft','draft']]){
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
   }else if(label==='detail'||label==='draft'||label==='transport'){
     assert(Math.abs(paint.bodyTop)<1,name+' '+label+' first-child margin moved the page background');
     assert(paint.bodyHeight>=viewport.height-1,name+' '+label+' background too short');
     assert(paint.bodyBackground?.includes('linear-gradient'),name+' '+label+' body gradient missing');
   }
   const logo=await page.locator('img[src="/book/apex-dog-mark.svg"]').first();
   assert(await logo.count()===1,name+' '+label+' missing Apex mark');
   assert(await logo.evaluate(el=>el.complete&&el.naturalWidth>0),name+' '+label+' logo failed to load');
   if(label==='book'){
     const heights=await page.locator('label.option-card:has(input[name="cameraCageRequested"]) > span')
       .evaluateAll(nodes=>nodes.map(el=>el.getBoundingClientRect().height));
     assert(heights.length===2,name+' boarding choices missing');
     assert(Math.abs(heights[0]-heights[1])<1,
       name+' standard and camera cards unequal: '+JSON.stringify(heights));
   }
   await page.screenshot({path:'mobile-'+name+'-'+label+'.png',fullPage:label!=='book'});
   results.push({viewport:name,page:label,...size});
  }
  await page.goto('http://127.0.0.1:'+port+'/book',{waitUntil:'domcontentloaded'});
  await page.locator('label.option:has(input[name="transportChoice"][value="both"]) > span').click();
  assert(await page.locator('#transport').isVisible(),name+' selecting both did not show location');
  await page.locator('#maps-link').fill('https://www.google.com/maps/search/?api=1&query=33.7%2C73.08');
  await page.waitForTimeout(900);
  assert((await page.locator('#coordinate-status').innerText()).includes('Google Maps location added'),name+' map link not accepted');
  assert(await page.locator('#selected-location-link').isVisible(),name+' selected pin not visible');
  // A short link that resolves to a place ID but has no precise pin must
  // remain unpriced, with clear copy/paste coordinates instructions.
  await page.locator('#maps-link').fill('https://maps.app.goo.gl/ambiguous');
  await page.waitForTimeout(900);
  assert((await page.locator('#coordinate-status').innerText()).includes('latitude, longitude'),
    name+' ambiguous short link has no actionable coordinates fallback');
  assert(!(await page.locator('#selected-location-link').isVisible()),
    name+' ambiguous short link retained a stale customer pin');
  await page.locator('#maps-link').fill('33.700000, 73.080000');
  await page.waitForTimeout(900);
  assert((await page.locator('#coordinate-status').innerText()).includes('Pin coordinates location added'),
    name+' coordinate fallback was not accepted');
  assert(await page.locator('#selected-location-link').isVisible(),
    name+' confirmed coordinates not displayed');
  await page.locator('label.option:has(input[name="transportChoice"][value="none"]) > span').click();
  assert(!(await page.locator('#transport').isVisible()),name+' no transport did not hide location');
  assert(errors.length===0,name+' JS errors: '+errors.join(';'));
  await page.close();
 }
 console.log(JSON.stringify({ok:true,results},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
