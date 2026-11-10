import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {renderStaffConsoleHtml} from '../src/staff-console.ts';
import {syntheticBookings} from '../src/staff-bookings.ts';
import {renderStaffTransportForm} from '../src/staff-transport-review.ts';
import {renderStaffBookingDetail} from '../src/staff-booking-detail.ts';
import {prepareStaffDraftReview,renderStaffDraftReview} from '../src/staff-invoice-draft.ts';
import {renderStaffPinChecker} from '../src/staff-location.ts';

const demoSource={
  bookingId:'a2026111-0e00-4c11-8a00-000000000033',
  customerName:'APEX CANARY TRANSPORT',petNames:'APEX SYNTHETIC CANARY PET',
  petCount:1,startDate:'2026-12-10',endDate:'2026-12-12',
  status:'requested',cameraCageRequested:false,transportRequested:true,synthetic:true,
  transportLocation:{latitude:33.70,longitude:73.08,service:'both',customerConfirmed:true}
};
const detail={
  id:demoSource.bookingId,status:'requested',createdAt:'2026-11-10',
  startDate:demoSource.startDate,endDate:demoSource.endDate,
  customerName:demoSource.customerName,email:null,phone:'0000000000',
  accommodationType:null,pets:[{name:demoSource.petNames,breed:'Synthetic'}],
  isSynthetic:true,hasFormDetails:true,transportLocation:demoSource.transportLocation,
  ownerAddress:'Synthetic test address',pickupDropoffRequested:true,cameraCageRequested:false,
  emergencyContactPhone:null,petGender:null,petAgeDescription:null,
  vaccinationStatus:null,distemperHistory:null,veterinarianPhone:null,personalityTraits:null,
  specialInstructions:null,medicationFeedingInstructions:null,termsAccepted:true
};
const base=process.cwd();
const pages={
  '/demo/staff':renderStaffConsoleHtml(syntheticBookings,{demo:true,filter:{query:'',status:'all'}}),
  '/staff/transport':renderStaffTransportForm(demoSource,'daily',0),
  '/staff/booking':renderStaffBookingDetail(detail),
  '/staff/draft':renderStaffDraftReview(prepareStaffDraftReview(demoSource,'daily')),
  '/staff/location':renderStaffPinChecker()
};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url??'/', 'http://127.0.0.1');
  if(url.pathname==='/api/book/config'){
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({enabled:false}));return;
  }
  if(url.pathname==='/api/book/location'){
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({
      latitude:33.7,longitude:73.08
    }));return;
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
   ['wide-desktop',{width:1920,height:900}]
 ]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1,isMobile:name.includes('phone')||name==='iphone',hasTouch:true});
  await page.route('**/challenges.cloudflare.com/**',route=>route.abort());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [route,label] of [
    ['/book','book'],['/demo/staff','dashboard'],['/staff/transport','transport'],
    ['/staff/booking','booking-detail'],['/staff/draft','draft'],['/staff/location','location']
  ]){
   await page.goto('http://127.0.0.1:'+port+route,{waitUntil:'domcontentloaded'});
   await page.waitForTimeout(200);
   const size=await page.evaluate(()=>{
     const body=document.body.getBoundingClientRect();
     const main=document.querySelector('main')?.getBoundingClientRect();
     const sidebar=document.querySelector('.sidebar')?.getBoundingClientRect();
     return {
       window:window.innerWidth,scroll:document.documentElement.scrollWidth,
       body:document.body.scrollWidth,bodyTop:body.top,bodyHeight:body.height,
       viewportRight:document.documentElement.clientWidth,
       mainLeft:main?.left,mainRight:main?.right,sidebarRight:sidebar?.right,
       bodyBackground:getComputedStyle(document.body).backgroundImage
     };
   });
   assert(size.scroll<=size.window+2,name+' '+label+' has horizontal overflow '+JSON.stringify(size));
   // The page's background must cover the viewport, not start below a collapsed margin.
   assert(Math.abs(size.bodyTop)<1,name+' '+label+' has unpainted top gutter '+JSON.stringify(size));
   assert(size.bodyHeight>=viewport.height-1,name+' '+label+' body fails to fill the viewport');
   if(label==='dashboard'){
     assert(Math.abs(size.mainRight-size.viewportRight)<1,
       name+' dashboard main leaves an unpainted right strip '+JSON.stringify(size));
     if(viewport.width>650)assert(Math.abs(size.mainLeft-size.sidebarRight)<1,
       name+' dashboard main leaves an unpainted strip after sidebar '+JSON.stringify(size));
   }else{
     assert(size.bodyBackground.includes('linear-gradient'),
       name+' '+label+' missing full-bleed body background');
   }
   const logo=await page.locator('img[src="/book/apex-dog-mark.svg"]').first();
   assert(await logo.count()===1,name+' '+label+' missing Apex mark');
   assert(await logo.evaluate(el=>el.complete&&el.naturalWidth>0),name+' '+label+' logo failed to load');
   if(['book','dashboard','transport'].includes(label)||
      name==='iphone'||name==='wide-desktop')
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
  await page.locator('label.option:has(input[name="transportChoice"][value="none"]) > span').click();
  assert(!(await page.locator('#transport').isVisible()),name+' no transport did not hide location');
  assert(errors.length===0,name+' JS errors: '+errors.join(';'));
  await page.close();
 }
 console.log(JSON.stringify({ok:true,results},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
